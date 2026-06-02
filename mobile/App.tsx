import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, type Region } from 'react-native-maps';

import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  createBusinessProfile,
  createCustomerProfile,
  createInformalBusinessProfile,
  createManualBusinessProfile,
  disableTwoFactor,
  fetchProfileDashboard,
  fetchPlaceDetail,
  fetchPlaces,
  getDefaultApiBaseUrl,
  loginProfile,
  requestPasswordReset,
  requestUsernameReminder,
  resendVerificationCode,
  resendVerificationEmail,
  toggleFavoriteBusiness,
  updateProfileDashboard,
  updateBusinessLocationTrackingPreference,
  updateBusinessLocation,
  verifyEmailCode,
} from './src/api';
import type { AuthPortal, LoginFormState, ProfileFormState } from './src/appFlowTypes';
import { styles } from './src/appStyles';
import {
  cityFilters,
  getBrowseEmptyStateMessage,
  getVenueMarkerStyle,
  type BrowseMode,
  type CityFilterValue,
  manualBusinessCityOptions,
  manualBusinessVenueOptions,
  multipleAreasBusinessCityOption,
  venueFilters,
  type VenueFilterValue,
  weekdayFilters,
  type WeekdayFilterValue,
} from './src/browseConfig';
import { AccountSettingsScreen, DashboardScreen } from './src/screens/DashboardScreen';
import { BrowseControls } from './src/screens/BrowseControls';
import { PlaceDetailScreen } from './src/screens/PlaceDetailScreen';
import { SplashScreen } from './src/screens/SplashScreen';
import {
  AuthPortalScreen,
  BusinessClaimReviewPendingScreen,
  BusinessSearchScreen,
  BusinessVerificationScreen,
  ContactSupportScreen,
  CreateProfileScreen,
  EmailVerificationScreen,
  PrivacyPolicyScreen,
  TermsOfServiceScreen,
} from './src/screens/ProfileFlowScreens';
import {
  consolidatePlacesBySlug,
  dedupeImageUrls,
  formatPlaceAddress,
  getPlaceCardAddress,
  getPlaceCardEyebrow,
  getPlaceLocations,
  getSelectedClaimLocation,
  normalizeSearchText,
} from './src/placeHelpers';
import type {
  BusinessAttachmentBuckets,
  BusinessAttachmentDraft,
  BusinessAttachmentKind,
  BusinessVerificationDocuments,
  BusinessSignupRequest,
  CustomerSignupRequest,
  Deal,
  EmailVerificationChallengeResponse,
  HappyHourWindow,
  InformalBusinessSignupRequest,
  LoginRequest,
  ManualBusinessSignupRequest,
  OperatingHourWindow,
  PlaceDetail,
  PlaceListItem,
  PlaceLocation,
  PlaceLocationDetail,
  ProfileDashboardUpdateRequest,
  SignupResponse,
  TwoFactorSetupResponse,
} from './src/types';

const initialApiBaseUrl = getDefaultApiBaseUrl();
const startupImageSources = [
  require('./assets/DiningDealz-Logo-Transparent.png'),
  require('./assets/DiningDealz-Icon-Transparent.png'),
] as const;
const mapAreaBounds = {
  minLatitude: 34.0,
  maxLatitude: 34.5,
  minLongitude: -119.55,
  maxLongitude: -118.85,
};
const minLatitudeDelta = 0.01;
const minLongitudeDelta = 0.01;
const maxLatitudeDelta = 0.24;
const maxLongitudeDelta = 0.32;
const maxMapGestureDelta = Math.hypot(maxLatitudeDelta, maxLongitudeDelta);
const mapFitPaddingFactor = 1.15;
const defaultMapRegion = {
  latitude: (mapAreaBounds.minLatitude + mapAreaBounds.maxLatitude) / 2,
  longitude: (mapAreaBounds.minLongitude + mapAreaBounds.maxLongitude) / 2,
  latitudeDelta: maxLatitudeDelta,
  longitudeDelta: maxLongitudeDelta,
};
const cityMapRegions: Record<Exclude<CityFilterValue, 'all'>, Region> = {
  ventura: {
    latitude: 34.2805,
    longitude: -119.255,
    latitudeDelta: 0.12,
    longitudeDelta: 0.14,
  },
  oxnard: {
    latitude: 34.2001,
    longitude: -119.1806,
    latitudeDelta: 0.12,
    longitudeDelta: 0.14,
  },
  camarillo: {
    latitude: 34.2164,
    longitude: -119.0376,
    latitudeDelta: 0.11,
    longitudeDelta: 0.13,
  },
};
const mobileBusinessVenueType = 'mobile';
const multipleAreasBusinessCityValue = multipleAreasBusinessCityOption.value;
type AppScreenMode = 'splash' | 'auth' | 'browse' | 'profiles' | 'settings' | 'support' | 'privacy-policy' | 'terms-of-service' | 'business-search' | 'business-claim' | 'manual-business-claim' | 'informal-business-claim' | 'email-verification' | 'business-claim-review-pending';
type OnboardingTransitionDirection = 'forward' | 'backward';
type TransitionAxis = 'x' | 'y';

type MappedPlace = PlaceListItem & {
  latitude: number;
  longitude: number;
  fullAddress: string;
  locationId: number;
  markerLatitude: number;
  markerLongitude: number;
  markerKey: string;
};

type BrowsePlace = PlaceListItem & {
  fullAddress: string;
  locationId: number;
  listKey: string;
};

const initialProfileFormState: ProfileFormState = {
  username: '',
  email: '',
  password: '',
  confirm_password: '',
  first_name: '',
  last_name: '',
  business_slug: '',
  business_name: '',
  business_city: '',
  business_venue_type: '',
  business_website_url: '',
  contact_name: '',
  job_title: '',
  work_email: '',
  work_phone: '',
  employer_address: '',
  address_not_applicable: false,
  social_media_links_text: '',
  offer_entries_text: '',
  hours_of_operation_entries_text: '',
  photo_references_text: '',
  verification_summary: '',
  supporting_details: '',
};

const initialBusinessAttachments: BusinessAttachmentBuckets = {
  social_media: [],
  business_registration: [],
  health_permit: [],
  abc_license: [],
  proof_of_address_control: [],
  proof_of_authority: [],
};

const verificationAttachmentMimeTypes = ['application/pdf', 'image/*'];

function splitMultilineEntries(value: string) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatPrefillTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return value;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function joinUniqueEntries(entries: string[]) {
  const uniqueEntries: string[] = [];
  const seenEntries = new Set<string>();

  entries.forEach((entry) => {
    const normalized = entry.trim();
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seenEntries.has(key)) {
      return;
    }
    seenEntries.add(key);
    uniqueEntries.push(normalized);
  });

  return uniqueEntries;
}

function formatOperatingHourEntry(window: OperatingHourWindow) {
  return `${window.weekday_label}: ${formatPrefillTime(window.open_time)} - ${formatPrefillTime(window.close_time)}`;
}

function formatHappyHourWindowEntry(window: HappyHourWindow) {
  if (window.all_day) {
    return `${window.weekday_label}: all day`;
  }

  return `${window.weekday_label}: ${formatPrefillTime(window.start_time)} - ${formatPrefillTime(window.end_time)}`;
}

function formatDealEntry(deal: Deal) {
  const sections = [deal.title.trim()];

  if (deal.price_text.trim()) {
    sections.push(deal.price_text.trim());
  }
  if (deal.description.trim()) {
    sections.push(deal.description.trim());
  }
  if (deal.terms.trim()) {
    sections.push(`Terms: ${deal.terms.trim()}`);
  }
  if (deal.happy_hours.length) {
    sections.push(`Happy hour: ${deal.happy_hours.map(formatHappyHourWindowEntry).join(', ')}`);
  }

  return sections.join(' | ');
}

function buildClaimPrefill(detail: PlaceDetail, locationId: number | null) {
  const selectedLocation = detail.locations.find((location) => location.id === locationId) ?? detail.locations[0] ?? detail;
  const operatingHours = selectedLocation.operating_hours.length ? selectedLocation.operating_hours : detail.operating_hours;
  const deals = selectedLocation.deals.length ? selectedLocation.deals : detail.deals;
  const imageReferences = dedupeImageUrls([...selectedLocation.image_urls, ...detail.image_urls]);

  return {
    locationId: selectedLocation.id,
    business_city: selectedLocation.city,
    business_venue_type: selectedLocation.venue_type,
    business_website_url: selectedLocation.website_url || detail.website_url,
    offer_entries_text: joinUniqueEntries(deals.map(formatDealEntry)).join('\n'),
    hours_of_operation_entries_text: joinUniqueEntries(operatingHours.map(formatOperatingHourEntry)).join('\n'),
    photo_references_text: imageReferences.join('\n'),
  };
}

function buildVerificationDocuments(): BusinessVerificationDocuments {
  return {
    business_registration: [],
    health_permit: [],
    abc_license: [],
    proof_of_address_control: [],
  };
}

function buildSharedBusinessDetails(form: ProfileFormState) {
  return {
    business_website_url: form.business_website_url.trim(),
    social_media_links: splitMultilineEntries(form.social_media_links_text),
    offer_entries: splitMultilineEntries(form.offer_entries_text),
    hours_of_operation_entries: splitMultilineEntries(form.hours_of_operation_entries_text),
    photo_references: splitMultilineEntries(form.photo_references_text),
  };
}

function normalizeBusinessAttachment(asset: DocumentPicker.DocumentPickerAsset): BusinessAttachmentDraft {
  return {
    id: `${asset.uri}::${asset.name}::${asset.size ?? 0}`,
    name: asset.name,
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    size: asset.size ?? null,
  };
}

function mergeBusinessAttachments(current: BusinessAttachmentDraft[], next: BusinessAttachmentDraft[]) {
  const merged = [...current];
  next.forEach((attachment) => {
    if (!merged.some((existing) => existing.id === attachment.id)) {
      merged.push(attachment);
    }
  });
  return merged;
}

function resetBusinessVerificationFields(current: ProfileFormState): ProfileFormState {
  return {
    ...current,
    business_slug: '',
    business_name: '',
    business_city: '',
    business_venue_type: '',
    business_website_url: '',
    contact_name: '',
    job_title: '',
    work_email: '',
    work_phone: '',
    employer_address: '',
    address_not_applicable: false,
    social_media_links_text: '',
    offer_entries_text: '',
    hours_of_operation_entries_text: '',
    photo_references_text: '',
    verification_summary: '',
    supporting_details: '',
  };
}

const initialLoginFormState: LoginFormState = {
  identifier: '',
  password: '',
  two_factor_code: '',
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AppScreen />
    </SafeAreaProvider>
  );
}

function AppScreen() {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const initialMapRegionRef = useRef<Region>(clampRegionToBounds(defaultMapRegion));
  const mapRef = useRef<MapView | null>(null);
  const onboardingTransitionFrameRef = useRef<number | null>(null);
  const suppressKeyboardLayoutAnimationUntilRef = useRef(0);
  const browseModeFadePendingRef = useRef(false);
  const splashExitOpacity = useRef(new Animated.Value(1)).current;
  const authIntroOpacity = useRef(new Animated.Value(1)).current;
  const loginSuccessTransition = useRef(new Animated.Value(1)).current;
  const screenTransition = useRef(new Animated.Value(1)).current;
  const profileSceneTransition = useRef(new Animated.Value(1)).current;
  const browseSceneTransition = useRef(new Animated.Value(1)).current;
  const browseModeTransition = useRef(new Animated.Value(0)).current;
  const mapPinsTransition = useRef(new Animated.Value(1)).current;
  const mapResultsOpacity = useRef(new Animated.Value(0)).current;
  const mapResultsExpandedProgress = useRef(new Animated.Value(1)).current;
  const mapPreviewOpacity = useRef(new Animated.Value(0)).current;
  const mapThemeFade = useRef(new Animated.Value(0)).current;
  const [apiBaseUrl, setApiBaseUrl] = useState(initialApiBaseUrl);
  const [screenMode, setScreenMode] = useState<AppScreenMode>('splash');
  const [onboardingTransitionDirection, setOnboardingTransitionDirection] = useState<OnboardingTransitionDirection>('forward');
  const [onboardingTransitionAxis, setOnboardingTransitionAxis] = useState<TransitionAxis>('x');
  const [onboardingIncomingOffset, setOnboardingIncomingOffset] = useState(0);
  const [authPortal, setAuthPortal] = useState<AuthPortal>('customer');
  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginFormState);
  const [showLoginTwoFactorCodeField, setShowLoginTwoFactorCodeField] = useState(false);
  const [shouldAutoFocusLoginField, setShouldAutoFocusLoginField] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [twoFactorSetupCode, setTwoFactorSetupCode] = useState('');
  const [twoFactorDisableCode, setTwoFactorDisableCode] = useState('');
  const [authenticatedSession, setAuthenticatedSession] = useState<SignupResponse | null>(null);
  const [browseMode, setBrowseMode] = useState<BrowseMode>('list');
  const [browseFiltersExpanded, setBrowseFiltersExpanded] = useState(false);
  const [darkMapMode, setDarkMapMode] = useState(false);
  const [displayedDarkMapMode, setDisplayedDarkMapMode] = useState(false);
  const [transitioningMapTheme, setTransitioningMapTheme] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<(typeof cityFilters)[number]['value']>('all');
  const [selectedVenueTypes, setSelectedVenueTypes] = useState<VenueFilterValue[]>(() => venueFilters.map((filter) => filter.value));
  const [confirmedDealsOnly, setConfirmedDealsOnly] = useState(false);
  const [selectedOperatingDays, setSelectedOperatingDays] = useState<WeekdayFilterValue[]>([]);
  const [selectedDealDays, setSelectedDealDays] = useState<WeekdayFilterValue[]>([]);
  const [verifiedBusinessesOnly, setVerifiedBusinessesOnly] = useState(false);
  const [places, setPlaces] = useState<PlaceListItem[]>([]);
  const [selectedPlaceSlug, setSelectedPlaceSlug] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetail | null>(null);
  const [selectedMapPlaceKey, setSelectedMapPlaceKey] = useState<string | null>(null);
  const [displayedMapPreviewPlace, setDisplayedMapPreviewPlace] = useState<MappedPlace | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [favoriteSubmitting, setFavoriteSubmitting] = useState(false);
  const [guestBrowseModeLocked, setGuestBrowseModeLocked] = useState(false);
  const [showGuestFavoritePrompt, setShowGuestFavoritePrompt] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>(() => initialMapRegionRef.current);
  const mapRegionRef = useRef(mapRegion);
  const [reloadCount, setReloadCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showMapResultsCard, setShowMapResultsCard] = useState(false);
  const [mapResultsCollapsed, setMapResultsCollapsed] = useState(false);
  const [renderedMapSearchResults, setRenderedMapSearchResults] = useState<MappedPlace[]>([]);
  const [renderedMapResultsKey, setRenderedMapResultsKey] = useState('');
  const [renderedMapResultCount, setRenderedMapResultCount] = useState(0);
  const [visibleMapResultCount, setVisibleMapResultCount] = useState(0);
  const [loadingMoreMapResults, setLoadingMoreMapResults] = useState(false);
  const [listRevealToken, setListRevealToken] = useState(0);
  const [listRevealEnabled, setListRevealEnabled] = useState(browseMode === 'list');
  const [mapMarkersTrackViewChanges, setMapMarkersTrackViewChanges] = useState(true);
  const showMoreMapResultsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFitMapRegionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapMarkersTrackViewChangesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingImmediateMapPinsRefreshRef = useRef(false);
  const pendingListRevealRef = useRef(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(initialProfileFormState);
  const [businessAttachments, setBusinessAttachments] = useState<BusinessAttachmentBuckets>(initialBusinessAttachments);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null);
  const [supportDraftContext, setSupportDraftContext] = useState<{ message: string; subject: string } | null>(null);
  const [pendingEmailVerification, setPendingEmailVerification] = useState<EmailVerificationChallengeResponse | null>(null);
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardSubmitting, setDashboardSubmitting] = useState(false);
  const [profilePlaces, setProfilePlaces] = useState<PlaceListItem[]>([]);
  const [profilePlacesLoading, setProfilePlacesLoading] = useState(false);
  const [businessSearchQuery, setBusinessSearchQuery] = useState('');
  const [selectedClaimPlace, setSelectedClaimPlace] = useState<PlaceListItem | null>(null);
  const [selectedClaimLocationId, setSelectedClaimLocationId] = useState<number | null>(null);
  const [logoutTransitionSession, setLogoutTransitionSession] = useState<SignupResponse | null>(null);
  const [incomingOnboardingScreen, setIncomingOnboardingScreen] = useState<AppScreenMode | null>(null);
  const [browseProfileTransitionFrom, setBrowseProfileTransitionFrom] = useState<'profiles' | 'browse' | null>(null);
  const [incomingBrowseProfileScreen, setIncomingBrowseProfileScreen] = useState<'profiles' | 'browse' | null>(null);
  const [guestBrowseTransitionFrom, setGuestBrowseTransitionFrom] = useState<'splash' | 'browse' | null>(null);
  const [incomingGuestBrowseScreen, setIncomingGuestBrowseScreen] = useState<'splash' | 'browse' | null>(null);
  const [showLoginSuccessTransition, setShowLoginSuccessTransition] = useState(false);
  const [showLogoutTransition, setShowLogoutTransition] = useState(false);
  const [authIntroPending, setAuthIntroPending] = useState(false);
  const [splashExiting, setSplashExiting] = useState(false);
  const [startupImagesReady, setStartupImagesReady] = useState(false);
  const [profileEntryOffset, setProfileEntryOffset] = useState(0);
  const [browseEntryOffset, setBrowseEntryOffset] = useState(0);
  const [renderedMappedPlaces, setRenderedMappedPlaces] = useState<MappedPlace[]>([]);
  const [renderedMappedPlaceKey, setRenderedMappedPlaceKey] = useState('');
  const authenticatedSessionRef = useRef<SignupResponse | null>(null);
  const businessLocationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const businessLocationLastReportedRef = useRef<string>('');
  const claimPrefillRequestRef = useRef(0);
  const claimPrefillLoadedKeyRef = useRef('');
  const startupImageLoadCountRef = useRef(0);
  const shouldUseNativeMapBoundaries = false;
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const onboardingTransitionDuration = 480;
  const showTransitionMapBrowse = browseProfileTransitionFrom !== null
    && incomingBrowseProfileScreen !== null
    && browseProfileTransitionFrom !== incomingBrowseProfileScreen
    && !selectedPlaceSlug
    && browseMode === 'map'
    && (browseProfileTransitionFrom === 'browse' || incomingBrowseProfileScreen === 'browse');
  const showMapBrowse = (screenMode === 'browse' && !selectedPlaceSlug && browseMode === 'map') || showTransitionMapBrowse;
  const translucentStatusBar = (screenMode === 'browse' && !selectedPlaceSlug && browseMode === 'map')
    || (browseProfileTransitionFrom === 'profiles'
      && incomingBrowseProfileScreen === 'browse'
      && !selectedPlaceSlug
      && browseMode === 'map');

  const filteredPlaces = getFilteredPlaces(places, {
    confirmedDealsOnly,
    searchQuery: normalizedSearchQuery,
    selectedCity,
    selectedDealDays,
    selectedOperatingDays,
    selectedVenueTypes,
    verifiedBusinessesOnly,
  });
  const filteredPlaceKey = filteredPlaces.map((place) => place.id).join('|');
  const displayedBrowsePlaces = getBrowsePlacesForDisplay(filteredPlaces);

  const mappedPlaces = showMapBrowse ? getMappedPlacesForBrowse(filteredPlaces) : [];
  const browseResultCount = showMapBrowse ? mappedPlaces.length : displayedBrowsePlaces.length;
  const mappedPlaceKey = mappedPlaces.map((place) => place.markerKey).join('|');
  const displayedMapPlaces = showMapBrowse ? renderedMappedPlaces : [];
  const unplacedPlaceCount = filteredPlaces.filter((place) => (
    !getPlaceLocations(place).some((location) => location.latitude !== null && location.longitude !== null)
  )).length;
  const selectedMapPlace = selectedMapPlaceKey
    ? displayedMapPlaces.find((place) => place.markerKey === selectedMapPlaceKey) ?? null
    : null;
  const displayedMapPreviewImageUrls = displayedMapPreviewPlace ? dedupeImageUrls(displayedMapPreviewPlace.image_urls) : [];
  const selectedPlaceLocation = getSelectedPlaceLocation(selectedPlace, selectedLocationId, selectedCity);
  const selectedPlaceDeals = selectedPlaceLocation?.deals ?? selectedPlace?.deals ?? [];
  const selectedPlaceOperatingHours = selectedPlaceLocation?.operating_hours ?? selectedPlace?.operating_hours ?? [];
  const guestMapOnlyMode = guestBrowseModeLocked && !authenticatedSession;
  const selectedPlaceIsFavorited = !!(selectedPlace && authenticatedSession?.favorite_businesses?.some((business) => business.slug === selectedPlace.slug));
  const showFavoriteControl = !authenticatedSession || authenticatedSession.portal === 'customer';
  const favoriteHelperText = !showFavoriteControl
    ? null
    : !authenticatedSession
      ? 'Star this business to keep tabs on it later. Guest stars require a free customer account.'
      : selectedPlaceIsFavorited
        ? 'This business is saved to your favorites and will appear on your dashboard.'
        : 'Save this business to your favorites so it appears on your dashboard.';

  useEffect(() => {
    mapRegionRef.current = mapRegion;
  }, [mapRegion]);

  useEffect(() => {
    authenticatedSessionRef.current = authenticatedSession;
  }, [authenticatedSession]);

  useEffect(() => {
    if (guestMapOnlyMode && browseMode !== 'map') {
      handleBrowseModeChange('map');
    }
  }, [browseMode, guestMapOnlyMode]);

  useEffect(() => {
    if (authenticatedSession) {
      setGuestBrowseModeLocked(false);
      setShowGuestFavoritePrompt(false);
    }
  }, [authenticatedSession]);

  useEffect(() => {
    let cancelled = false;

    async function startBusinessLocationTracking() {
      if (
        !authenticatedSession?.auth_token
        || authenticatedSession.portal !== 'business'
        || !authenticatedSession.requires_business_location_tracking
      ) {
        businessLocationLastReportedRef.current = '';
        businessLocationWatcherRef.current?.remove();
        businessLocationWatcherRef.current = null;
        return;
      }

      if (businessLocationWatcherRef.current) {
        return;
      }

      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) {
          return;
        }

        if (!permission.granted) {
          setProfileErrorMessage('Service area businesses must enable location access so their map pin can follow their current service area.');
          return;
        }

        const reportLocation = async (coords: { latitude: number; longitude: number; accuracy?: number | null }) => {
          const currentSession = authenticatedSessionRef.current;
          if (!currentSession?.auth_token || !currentSession.requires_business_location_tracking) {
            return;
          }

          const roundedLocationKey = `${coords.latitude.toFixed(4)}:${coords.longitude.toFixed(4)}`;
          if (businessLocationLastReportedRef.current === roundedLocationKey) {
            return;
          }

          businessLocationLastReportedRef.current = roundedLocationKey;
          try {
            const response = await updateBusinessLocation(apiBaseUrl, currentSession.auth_token, {
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy_meters: coords.accuracy ?? null,
            });
            if (!cancelled) {
              setAuthenticatedSession(response);
            }
          } catch (error) {
            if (!cancelled) {
              setProfileErrorMessage(getErrorMessage(error));
            }
          }
        };

        const initialPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) {
          return;
        }
        void reportLocation(initialPosition.coords);

        const watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 75,
            timeInterval: 60000,
          },
          (position) => {
            void reportLocation(position.coords);
          },
        );

        if (cancelled) {
          watcher.remove();
          return;
        }

        businessLocationWatcherRef.current = watcher;
      } catch (error) {
        if (!cancelled) {
          setProfileErrorMessage(getErrorMessage(error));
        }
      }
    }

    void startBusinessLocationTracking();

    return () => {
      cancelled = true;
      businessLocationWatcherRef.current?.remove();
      businessLocationWatcherRef.current = null;
    };
  }, [apiBaseUrl, authenticatedSession?.auth_token, authenticatedSession?.portal, authenticatedSession?.requires_business_location_tracking]);

  useEffect(() => {
    if (startupImagesReady) {
      return;
    }

    const fallbackId = setTimeout(() => {
      setStartupImagesReady(true);
    }, 2200);

    return () => {
      clearTimeout(fallbackId);
    };
  }, [startupImagesReady]);

  const mapSearchResultPool = normalizedSearchQuery.length ? displayedMapPlaces : [];
  const mapSearchResultsKey = mapSearchResultPool.map((place) => place.markerKey).join('|');
  const mapOverlayBottomPadding = Math.max(insets.bottom + 12, 20);
  const floatingDashboardButtonOffset = Math.max(insets.bottom + 16, 24);
  const mapResultsCardMaxHeight = Math.max(
    width > height
      ? Math.min(height * 0.5, keyboardHeight > 0 ? 300 : 360)
      : Math.min(height * 0.58, keyboardHeight > 0 ? 380 : 500),
    220,
  );
  const availableProfilePlaces = profilePlaces.length ? profilePlaces : places;

  function clearShowMoreMapResultsTimer() {
    if (showMoreMapResultsTimeoutRef.current === null) {
      return;
    }

    clearTimeout(showMoreMapResultsTimeoutRef.current);
    showMoreMapResultsTimeoutRef.current = null;
  }

  function clearAutoFitMapRegionTimer() {
    if (autoFitMapRegionTimeoutRef.current === null) {
      return;
    }

    clearTimeout(autoFitMapRegionTimeoutRef.current);
    autoFitMapRegionTimeoutRef.current = null;
  }

  function clearMapMarkersTrackViewChangesTimer() {
    if (mapMarkersTrackViewChangesTimeoutRef.current === null) {
      return;
    }

    clearTimeout(mapMarkersTrackViewChangesTimeoutRef.current);
    mapMarkersTrackViewChangesTimeoutRef.current = null;
  }

  useEffect(() => () => {
    clearShowMoreMapResultsTimer();
    clearAutoFitMapRegionTimer();
    clearMapMarkersTrackViewChangesTimer();
  }, []);

  useEffect(() => {
    async function handleInitialUrl() {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await handleAppUrl(initialUrl);
      }
    }

    void handleInitialUrl();
    const subscription = Linking.addEventListener('url', (event) => {
      void handleAppUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [apiBaseUrl]);
  const availableClaimPlaces = consolidatePlacesBySlug(availableProfilePlaces);
  const onboardingScreenKeys = new Set<AppScreenMode>(['splash', 'auth', 'profiles', 'settings', 'support', 'privacy-policy', 'terms-of-service', 'business-search', 'business-claim', 'manual-business-claim', 'informal-business-claim', 'email-verification', 'business-claim-review-pending']);
  const profileStackTransitionScreens = new Set<AppScreenMode>(['profiles', 'settings', 'support', 'privacy-policy', 'terms-of-service']);
  const currentOnboardingScreen = onboardingScreenKeys.has(screenMode) ? screenMode : null;
  const usesOnboardingSlideTransition = currentOnboardingScreen !== null || incomingOnboardingScreen !== null;
  const usesProfileStackSlideTransition = currentOnboardingScreen !== null
    && incomingOnboardingScreen !== null
    && profileStackTransitionScreens.has(currentOnboardingScreen)
    && profileStackTransitionScreens.has(incomingOnboardingScreen);
  const usesBrowseProfileSlideTransition = browseProfileTransitionFrom !== null
    && incomingBrowseProfileScreen !== null
    && browseProfileTransitionFrom !== incomingBrowseProfileScreen;
  const profileToBrowseTransition = browseProfileTransitionFrom === 'profiles' && incomingBrowseProfileScreen === 'browse';
  const usesGuestBrowseSlideTransition = guestBrowseTransitionFrom !== null
    && incomingGuestBrowseScreen !== null
    && guestBrowseTransitionFrom !== incomingGuestBrowseScreen;
  const guestToBrowseTransition = guestBrowseTransitionFrom === 'splash' && incomingGuestBrowseScreen === 'browse';
  const onboardingSlideOffset = onboardingIncomingOffset || (onboardingTransitionDirection === 'forward' ? width : -width);
  const incomingScreenTransitionStyle = {
    opacity: onboardingTransitionAxis === 'y'
      ? 1
      : screenTransition.interpolate({
          inputRange: [0, 0.18, 1],
          outputRange: [0.94, 0.98, 1],
        }),
    transform: [
      onboardingTransitionAxis === 'y'
        ? {
            translateY: screenTransition.interpolate({
              inputRange: [0, 1],
              outputRange: [onboardingSlideOffset, 0],
            }),
          }
        : {
            translateX: screenTransition.interpolate({
              inputRange: [0, 1],
              outputRange: [onboardingSlideOffset, 0],
            }),
          },
    ],
  };
  const currentOnboardingTransitionStyle = incomingOnboardingScreen && onboardingTransitionAxis === 'y' && currentOnboardingScreen !== incomingOnboardingScreen
    ? {
        opacity: 1,
        transform: [
          {
            translateY: screenTransition.interpolate({
              inputRange: [0, 1],
              outputRange: [0, height],
            }),
          },
        ],
      }
    : null;
  const browseProfileOutgoingStyle = {
    transform: [
      {
        translateX: screenTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0, profileToBrowseTransition ? width : -width],
        }),
      },
    ],
  };
  const browseProfileIncomingStyle = {
    opacity: screenTransition.interpolate({
      inputRange: [0, 0.12, 1],
      outputRange: [0.96, 0.98, 1],
    }),
    transform: [
      {
        translateX: screenTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [profileToBrowseTransition ? -width : width, 0],
        }),
      },
    ],
  };
  const guestBrowseOutgoingStyle = {
    transform: [
      {
        translateX: screenTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0, guestToBrowseTransition ? width : -width],
        }),
      },
    ],
  };
  const guestBrowseIncomingStyle = {
    opacity: screenTransition.interpolate({
      inputRange: [0, 0.12, 1],
      outputRange: [0.96, 0.98, 1],
    }),
    transform: [
      {
        translateX: screenTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [guestToBrowseTransition ? -width : width, 0],
        }),
      },
    ],
  };
  const screenTransitionStyle = {
    opacity: screenTransition,
    transform: [
      {
        translateY: screenTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };
  const profileSceneTransitionStyle = {
    opacity: profileSceneTransition,
    transform: [
      {
        translateX: profileSceneTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [profileEntryOffset, 0],
        }),
      },
    ],
  };
  const browseSceneTransitionStyle = {
    opacity: browseSceneTransition,
    transform: [
      {
        translateX: browseSceneTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [browseEntryOffset, 0],
        }),
      },
    ],
  };
  const browseModeTransitionStyle = {
    opacity: browseModeTransition,
  };
  const listModeTransitionStyle = {
    opacity: browseModeTransition.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
  };
  const loginSuccessOutgoingStyle = {
    transform: [
      {
        translateY: loginSuccessTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0, height],
        }),
      },
    ],
  };
  const loginSuccessIncomingStyle = {
    transform: [
      {
        translateY: loginSuccessTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [-height, 0],
        }),
      },
    ],
  };
  const logoutOutgoingStyle = {
    transform: [
      {
        translateY: loginSuccessTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -height],
        }),
      },
    ],
  };
  const logoutIncomingStyle = {
    transform: [
      {
        translateY: loginSuccessTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [height, 0],
        }),
      },
    ],
  };
  const authIntroStyle = authIntroPending && !incomingOnboardingScreen && currentOnboardingScreen === 'auth'
    ? {
        opacity: authIntroOpacity,
        transform: [
          {
            translateY: authIntroOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
      }
    : null;

  const shouldShowMapResults = showMapBrowse && !selectedMapPlace && normalizedSearchQuery.length > 0;
  const isLandscape = width > height;
  const useWideLandscapeLayout = isLandscape && width >= 760;
  const browseListColumns = useWideLandscapeLayout ? 2 : 1;
  const normalizedBusinessSearchQuery = normalizeSearchText(businessSearchQuery);

  async function handleAppUrl(url: string) {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return;
    }

    const route = `${parsedUrl.host}${parsedUrl.pathname}`.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (route !== 'email-verification') {
      return;
    }

    const status = (parsedUrl.searchParams.get('status') ?? '').trim().toLowerCase();
    if (status === 'success') {
      dismissKeyboardForScreenTransition();
      setProfileErrorMessage(null);
      setAuthMessage(null);
      setProfileMessage('Email verified successfully.');

      const currentSession = authenticatedSessionRef.current;
      if (currentSession?.auth_token) {
        try {
          const response = await fetchProfileDashboard(apiBaseUrl, currentSession.auth_token, currentSession.portal);
          setAuthenticatedSession(response);
          setScreenMode('profiles');
        } catch (error) {
          setProfileErrorMessage(getErrorMessage(error));
        }
      } else {
        setScreenMode('auth');
        setAuthMessage('Email verified successfully. Sign in to continue.');
      }
      return;
    }

    if (status === 'failure') {
      setProfileMessage(null);
      setProfileErrorMessage('Verification link is invalid or expired. Request a new verification email and try again.');
      if (!authenticatedSessionRef.current) {
        setScreenMode('auth');
      }
    }
  }
  const nextMapResultsIncrement = getMapResultsIncrement(renderedMapResultCount);
  const businessSearchResults = normalizedBusinessSearchQuery.length
    ? availableClaimPlaces
      .map((place) => ({ place, score: getPlaceSearchScore(place, normalizedBusinessSearchQuery) }))
      .filter(({ score }) => score > 0)
      .sort((first, second) => second.score - first.score)
      .map(({ place }) => place)
      .slice(0, 12)
    : [];
  const selectedClaimLocation = getSelectedClaimLocation(selectedClaimPlace, selectedClaimLocationId);

  function animateNextLayout() {
    LayoutAnimation.configureNext({
      duration: 220,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  }

  function dismissKeyboardForScreenTransition() {
    suppressKeyboardLayoutAnimationUntilRef.current = Date.now() + onboardingTransitionDuration + 120;
    Keyboard.dismiss();
  }

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (onboardingTransitionFrameRef.current !== null) {
        cancelAnimationFrame(onboardingTransitionFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!authIntroPending || screenMode !== 'auth') {
      return;
    }

    authIntroOpacity.stopAnimation();
    authIntroOpacity.setValue(0);
    Animated.timing(authIntroOpacity, {
      duration: 280,
      toValue: 1,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setAuthIntroPending(false);
      }
    });
  }, [authIntroOpacity, authIntroPending, screenMode]);

  useEffect(() => {
    if (screenMode !== 'profiles' || incomingOnboardingScreen || profileEntryOffset === 0) {
      return;
    }

    profileSceneTransition.stopAnimation();
    profileSceneTransition.setValue(0);
    Animated.timing(profileSceneTransition, {
      duration: 320,
      toValue: 1,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setProfileEntryOffset(0);
      }
    });
  }, [incomingOnboardingScreen, profileEntryOffset, profileSceneTransition, screenMode]);

  useEffect(() => {
    if (screenMode !== 'browse' || selectedPlaceSlug || browseEntryOffset === 0) {
      return;
    }

    browseSceneTransition.stopAnimation();
    browseSceneTransition.setValue(0);
    Animated.timing(browseSceneTransition, {
      duration: 320,
      toValue: 1,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setBrowseEntryOffset(0);
      }
    });
  }, [browseEntryOffset, browseSceneTransition, screenMode, selectedPlaceSlug]);

  useEffect(() => {
    if (!showMapBrowse || listLoading) {
      if (renderedMappedPlaces.length || renderedMappedPlaceKey) {
        setRenderedMappedPlaces([]);
        setRenderedMappedPlaceKey('');
      }
      mapPinsTransition.stopAnimation();
      mapPinsTransition.setValue(1);
      return;
    }

    if (renderedMappedPlaceKey === mappedPlaceKey && !pendingImmediateMapPinsRefreshRef.current) {
      return;
    }

    pendingImmediateMapPinsRefreshRef.current = false;
    mapPinsTransition.stopAnimation();
    setRenderedMappedPlaces(mappedPlaces);
    setRenderedMappedPlaceKey(mappedPlaceKey);
    mapPinsTransition.setValue(0);
    requestAnimationFrame(() => {
      Animated.timing(mapPinsTransition, {
        duration: 1450,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start();
    });
  }, [listLoading, mapPinsTransition, mappedPlaceKey, mappedPlaces, renderedMappedPlaceKey, renderedMappedPlaces.length, showMapBrowse]);

  function navigateScreen(
    nextScreen: AppScreenMode,
    direction: OnboardingTransitionDirection,
    transitionOverride?: { axis: TransitionAxis; incomingOffset: number },
  ) {
    const currentScreen = screenMode;
    const shouldAnimateOnboarding = onboardingScreenKeys.has(currentScreen)
      && onboardingScreenKeys.has(nextScreen)
      && currentScreen !== nextScreen;

    setOnboardingTransitionDirection(direction);
    setOnboardingTransitionAxis(transitionOverride?.axis ?? 'x');
    setOnboardingIncomingOffset(transitionOverride?.incomingOffset ?? (direction === 'forward' ? width : -width));
    screenTransition.stopAnimation();

    if (onboardingTransitionFrameRef.current !== null) {
      cancelAnimationFrame(onboardingTransitionFrameRef.current);
      onboardingTransitionFrameRef.current = null;
    }

    if (!shouldAnimateOnboarding) {
      setBrowseProfileTransitionFrom(null);
      setIncomingBrowseProfileScreen(null);
      setIncomingOnboardingScreen(null);
      screenTransition.setValue(1);
      setScreenMode(nextScreen);
      return;
    }

    screenTransition.setValue(0);
    setIncomingOnboardingScreen(nextScreen);
    onboardingTransitionFrameRef.current = requestAnimationFrame(() => {
      onboardingTransitionFrameRef.current = null;
      Animated.timing(screenTransition, {
        duration: onboardingTransitionDuration,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }

        setIncomingOnboardingScreen(null);
        setScreenMode(nextScreen);
        screenTransition.setValue(1);
      });
    });
  }

  function navigateBrowseProfileTransition(nextScreen: 'profiles' | 'browse') {
    if (screenMode === nextScreen) {
      return;
    }

    const currentBrowseProfileScreen = screenMode === 'profiles' ? 'profiles' : 'browse';

    if (onboardingTransitionFrameRef.current !== null) {
      cancelAnimationFrame(onboardingTransitionFrameRef.current);
      onboardingTransitionFrameRef.current = null;
    }

    screenTransition.stopAnimation();
    profileSceneTransition.stopAnimation();
    browseSceneTransition.stopAnimation();
    profileSceneTransition.setValue(1);
    browseSceneTransition.setValue(1);
    setProfileEntryOffset(0);
    setBrowseEntryOffset(0);
    setBrowseProfileTransitionFrom(currentBrowseProfileScreen);
    setIncomingBrowseProfileScreen(null);
    setIncomingOnboardingScreen(null);
    screenTransition.setValue(0);
    setIncomingBrowseProfileScreen(nextScreen);
    onboardingTransitionFrameRef.current = requestAnimationFrame(() => {
      onboardingTransitionFrameRef.current = null;
      Animated.timing(screenTransition, {
        duration: onboardingTransitionDuration,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          setBrowseProfileTransitionFrom(null);
          setIncomingBrowseProfileScreen(null);
          return;
        }

        setScreenMode(nextScreen);
        profileSceneTransition.setValue(1);
        browseSceneTransition.setValue(1);
        setProfileEntryOffset(0);
        setBrowseEntryOffset(0);
        setBrowseProfileTransitionFrom(null);
        setIncomingBrowseProfileScreen(null);
        screenTransition.setValue(1);
      });
    });
  }

  function navigateGuestBrowseTransition(nextScreen: 'splash' | 'browse', onComplete?: () => void) {
    if (screenMode === nextScreen) {
      onComplete?.();
      return;
    }

    const currentGuestBrowseScreen = screenMode === 'splash' ? 'splash' : 'browse';

    if (onboardingTransitionFrameRef.current !== null) {
      cancelAnimationFrame(onboardingTransitionFrameRef.current);
      onboardingTransitionFrameRef.current = null;
    }

    screenTransition.stopAnimation();
    profileSceneTransition.stopAnimation();
    browseSceneTransition.stopAnimation();
    profileSceneTransition.setValue(1);
    browseSceneTransition.setValue(1);
    setProfileEntryOffset(0);
    setBrowseEntryOffset(0);
    setBrowseProfileTransitionFrom(null);
    setIncomingBrowseProfileScreen(null);
    setIncomingOnboardingScreen(null);
    setGuestBrowseTransitionFrom(currentGuestBrowseScreen);
    setIncomingGuestBrowseScreen(null);
    screenTransition.setValue(0);
    setIncomingGuestBrowseScreen(nextScreen);
    onboardingTransitionFrameRef.current = requestAnimationFrame(() => {
      onboardingTransitionFrameRef.current = null;
      Animated.timing(screenTransition, {
        duration: onboardingTransitionDuration,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          setGuestBrowseTransitionFrom(null);
          setIncomingGuestBrowseScreen(null);
          return;
        }

        setScreenMode(nextScreen);
        profileSceneTransition.setValue(1);
        browseSceneTransition.setValue(1);
        setProfileEntryOffset(0);
        setBrowseEntryOffset(0);
        setGuestBrowseTransitionFrom(null);
        setIncomingGuestBrowseScreen(null);
        screenTransition.setValue(1);
        onComplete?.();
      });
    });
  }

  function startLoginSuccessTransition() {
    dismissKeyboardForScreenTransition();

    if (onboardingTransitionFrameRef.current !== null) {
      cancelAnimationFrame(onboardingTransitionFrameRef.current);
      onboardingTransitionFrameRef.current = null;
    }

    screenTransition.stopAnimation();
    setIncomingOnboardingScreen(null);
    setShowLoginSuccessTransition(true);
    loginSuccessTransition.stopAnimation();
    loginSuccessTransition.setValue(0);
    Animated.timing(loginSuccessTransition, {
      duration: onboardingTransitionDuration,
      toValue: 1,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setScreenMode('profiles');
      requestAnimationFrame(() => {
        setShowLoginSuccessTransition(false);
        loginSuccessTransition.setValue(1);
      });
    });
  }

  function startLogoutTransition() {
    if (!authenticatedSession) {
      setScreenMode('auth');
      return;
    }

    if (onboardingTransitionFrameRef.current !== null) {
      cancelAnimationFrame(onboardingTransitionFrameRef.current);
      onboardingTransitionFrameRef.current = null;
    }

    screenTransition.stopAnimation();
    setIncomingOnboardingScreen(null);
    setLogoutTransitionSession(authenticatedSession);
    setAuthenticatedSession(null);
    setPendingEmailVerification(null);
    setEmailVerificationCode('');
    setScreenMode('auth');
    setAuthIntroPending(false);
    setShowLogoutTransition(true);
    loginSuccessTransition.stopAnimation();
    loginSuccessTransition.setValue(0);
    Animated.timing(loginSuccessTransition, {
      duration: onboardingTransitionDuration,
      toValue: 1,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      requestAnimationFrame(() => {
        setShowLogoutTransition(false);
        setLogoutTransitionSession(null);
        loginSuccessTransition.setValue(1);
      });
    });
  }

  function handleStartupImageLoaded() {
    if (startupImagesReady) {
      return;
    }

    startupImageLoadCountRef.current += 1;
    if (startupImageLoadCountRef.current >= startupImageSources.length) {
      setStartupImagesReady(true);
    }
  }

  useEffect(() => {
    if (shouldShowMapResults) {
      const resultsChanged = (
        mapSearchResultsKey !== renderedMapResultsKey ||
        mapSearchResultPool.length !== renderedMapResultCount
      );

      if (resultsChanged) {
        const nextVisibleCount = Math.min(5, mapSearchResultPool.length);
        setVisibleMapResultCount(nextVisibleCount);
        setRenderedMapSearchResults(mapSearchResultPool.slice(0, nextVisibleCount));
        setRenderedMapResultsKey(mapSearchResultsKey);
        setRenderedMapResultCount(mapSearchResultPool.length);
      }

      if (!showMapResultsCard) {
        setShowMapResultsCard(true);
        mapResultsOpacity.stopAnimation();
        mapResultsOpacity.setValue(0);
        Animated.timing(mapResultsOpacity, {
          duration: 180,
          toValue: 1,
          useNativeDriver: true,
        }).start();
        return;
      }

      if (resultsChanged) {
        mapResultsOpacity.stopAnimation();
        Animated.sequence([
          Animated.timing(mapResultsOpacity, {
            duration: 90,
            toValue: 0.55,
            useNativeDriver: true,
          }),
          Animated.timing(mapResultsOpacity, {
            duration: 140,
            toValue: 1,
            useNativeDriver: true,
          }),
        ]).start();
      }
      return;
    }

    if (!showMapResultsCard) {
      return;
    }

    mapResultsOpacity.stopAnimation();
    Animated.timing(mapResultsOpacity, {
      duration: 160,
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setShowMapResultsCard(false);
      setMapResultsCollapsed(false);
      setRenderedMapSearchResults([]);
      setRenderedMapResultsKey('');
      setRenderedMapResultCount(0);
      setVisibleMapResultCount(0);
      setLoadingMoreMapResults(false);
      clearShowMoreMapResultsTimer();
    });
  }, [
    mapResultsOpacity,
    mapSearchResultPool,
    mapSearchResultPool.length,
    mapSearchResultsKey,
    renderedMapResultCount,
    renderedMapResultsKey,
    shouldShowMapResults,
    showMapResultsCard,
  ]);

  useEffect(() => {
    Animated.timing(mapResultsExpandedProgress, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: mapResultsCollapsed ? 0 : 1,
      useNativeDriver: false,
    }).start();
  }, [mapResultsCollapsed, mapResultsExpandedProgress]);

  function handleShowMoreMapResults() {
    if (loadingMoreMapResults) {
      return;
    }

    const nextVisibleCount = Math.min(
      visibleMapResultCount + nextMapResultsIncrement,
      mapSearchResultPool.length,
    );

    setLoadingMoreMapResults(true);
    clearShowMoreMapResultsTimer();
    showMoreMapResultsTimeoutRef.current = setTimeout(() => {
      setVisibleMapResultCount(nextVisibleCount);
      setRenderedMapSearchResults(mapSearchResultPool.slice(0, nextVisibleCount));
      setLoadingMoreMapResults(false);
      showMoreMapResultsTimeoutRef.current = null;
    }, 1000);
  }

  function handleToggleMapResultsCollapsed() {
    setMapResultsCollapsed((current) => !current);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadPlaces() {
      setListLoading(true);
      setErrorMessage(null);

      try {
        const nextPlaces = await fetchPlaces(apiBaseUrl, selectedCity);
        if (!isMounted) {
          return;
        }

        setPlaces(nextPlaces);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
        setPlaces([]);
      } finally {
        if (isMounted) {
          setListLoading(false);
        }
      }
    }

    void loadPlaces();

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, reloadCount, selectedCity]);

  useEffect(() => {
    if (!selectedPlaceSlug) {
      setSelectedPlace(null);
      return;
    }

    const placeSlug = selectedPlaceSlug;

    let isMounted = true;

    async function loadPlaceDetail() {
      setDetailLoading(true);
      setErrorMessage(null);

      try {
        const detail = await fetchPlaceDetail(apiBaseUrl, placeSlug);
        if (!isMounted) {
          return;
        }

        setSelectedPlace(detail);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
      } finally {
        if (isMounted) {
          setDetailLoading(false);
        }
      }
    }

    void loadPlaceDetail();

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, reloadCount, selectedPlaceSlug]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      if (Date.now() < suppressKeyboardLayoutAnimationUntilRef.current) {
        setKeyboardHeight(event.endCoordinates.height);
        return;
      }

      animateNextLayout();
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      if (Date.now() < suppressKeyboardLayoutAnimationUntilRef.current) {
        setKeyboardHeight(0);
        return;
      }

      animateNextLayout();
      setKeyboardHeight(0);
    });

  return () => {
    showSubscription.remove();
    hideSubscription.remove();
  };
  }, []);

  useEffect(() => {
    if (!showMapBrowse || listLoading) {
      clearAutoFitMapRegionTimer();
      return;
    }

    const nextRegion = getBrowseMapRegion(selectedCity, mappedPlaces);
    const boundedRegion = clampRegionToBounds(nextRegion);

    if (areRegionsEqual(mapRegionRef.current, boundedRegion)) {
      clearAutoFitMapRegionTimer();
      return;
    }

    clearAutoFitMapRegionTimer();
    autoFitMapRegionTimeoutRef.current = setTimeout(() => {
      mapRegionRef.current = boundedRegion;
      setMapRegion((currentRegion) => (
        areRegionsEqual(currentRegion, boundedRegion) ? currentRegion : boundedRegion
      ));
      mapRef.current?.animateToRegion(boundedRegion, 220);
      autoFitMapRegionTimeoutRef.current = null;
    }, normalizedSearchQuery.length > 0 ? 140 : 0);
  }, [filteredPlaceKey, listLoading, normalizedSearchQuery.length, selectedCity, showMapBrowse]);

  useEffect(() => {
    if (!showMapBrowse) {
      clearMapMarkersTrackViewChangesTimer();
      setMapMarkersTrackViewChanges(true);
      return;
    }

    setMapMarkersTrackViewChanges(true);
    clearMapMarkersTrackViewChangesTimer();
    mapMarkersTrackViewChangesTimeoutRef.current = setTimeout(() => {
      setMapMarkersTrackViewChanges(false);
      mapMarkersTrackViewChangesTimeoutRef.current = null;
    }, 1600);
  }, [renderedMappedPlaceKey, selectedMapPlaceKey, showMapBrowse]);

  useEffect(() => {
    if (!['profiles', 'business-search', 'business-claim', 'manual-business-claim', 'informal-business-claim'].includes(screenMode)) {
      return;
    }

    if (selectedCity === 'all' && places.length > 0) {
      setProfilePlaces(places);
      setProfilePlacesLoading(false);
      return;
    }

    let isMounted = true;
    setProfilePlacesLoading(true);

    void fetchPlaces(apiBaseUrl, 'all').then((nextPlaces) => {
      if (!isMounted) {
        return;
      }

      setProfilePlaces(nextPlaces);
    }).catch((error) => {
      if (!isMounted) {
        return;
      }

      setProfileErrorMessage(getErrorMessage(error));
    }).finally(() => {
      if (isMounted) {
        setProfilePlacesLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, screenMode]);

  useEffect(() => {
    if (screenMode !== 'profiles' || !authenticatedSession?.auth_token) {
      return;
    }

    void refreshDashboard(false);
  }, [apiBaseUrl, authenticatedSession?.auth_token, screenMode]);

  useEffect(() => {
    if (screenMode !== 'business-claim' || !profileForm.business_slug) {
      return;
    }

    const prefillKey = `${profileForm.business_slug}:${selectedClaimLocationId ?? 'default'}`;
    if (claimPrefillLoadedKeyRef.current === prefillKey) {
      return;
    }

    let isMounted = true;
    const requestId = claimPrefillRequestRef.current + 1;
    claimPrefillRequestRef.current = requestId;

    void fetchPlaceDetail(apiBaseUrl, profileForm.business_slug)
      .then((detail) => {
        if (!isMounted || claimPrefillRequestRef.current !== requestId) {
          return;
        }

        const prefill = buildClaimPrefill(detail, selectedClaimLocationId);
        claimPrefillLoadedKeyRef.current = prefillKey;

        startTransition(() => {
          setSelectedClaimPlace(detail);
          setSelectedClaimLocationId(prefill.locationId);
          setProfileForm((current) => {
            if (current.business_slug !== profileForm.business_slug) {
              return current;
            }

            return {
              ...current,
              business_city: current.business_city || prefill.business_city,
              business_venue_type: current.business_venue_type || prefill.business_venue_type,
              business_website_url: current.business_website_url || prefill.business_website_url,
              offer_entries_text: current.offer_entries_text.trim() ? current.offer_entries_text : prefill.offer_entries_text,
              hours_of_operation_entries_text: current.hours_of_operation_entries_text.trim() ? current.hours_of_operation_entries_text : prefill.hours_of_operation_entries_text,
              photo_references_text: current.photo_references_text.trim() ? current.photo_references_text : prefill.photo_references_text,
            };
          });
        });
      })
      .catch(() => {
      });

    return () => {
      isMounted = false;
    };
  }, [
    apiBaseUrl,
    profileForm.business_slug,
    screenMode,
    selectedClaimLocationId,
  ]);

  useEffect(() => {
    if (!showMapBrowse || !shouldUseNativeMapBoundaries || !mapRef.current) {
      return;
    }

    mapRef.current.setMapBoundaries(
      { latitude: mapAreaBounds.maxLatitude, longitude: mapAreaBounds.maxLongitude },
      { latitude: mapAreaBounds.minLatitude, longitude: mapAreaBounds.minLongitude },
    );
  }, [shouldUseNativeMapBoundaries, showMapBrowse]);

  useEffect(() => {
    if (!selectedPlace) {
      return;
    }

    const nextLocation = getSelectedPlaceLocation(selectedPlace, selectedLocationId, selectedCity);
    if (nextLocation && nextLocation.id !== selectedLocationId) {
      setSelectedLocationId(nextLocation.id);
    }
  }, [selectedCity, selectedPlace]);

  useEffect(() => {
    if (!showMapBrowse || !selectedMapPlaceKey) {
      if (!showMapBrowse && selectedMapPlaceKey !== null) {
        setSelectedMapPlaceKey(null);
      }
      return;
    }

    if (!displayedMapPlaces.some((place) => place.markerKey === selectedMapPlaceKey)) {
      setSelectedMapPlaceKey(null);
    }
  }, [displayedMapPlaces, selectedMapPlaceKey, showMapBrowse]);

  useEffect(() => {
    if (!showMapBrowse) {
      mapPreviewOpacity.stopAnimation();
      mapPreviewOpacity.setValue(0);
      if (displayedMapPreviewPlace !== null) {
        setDisplayedMapPreviewPlace(null);
      }
      return;
    }

    if (selectedMapPlace) {
      setDisplayedMapPreviewPlace(selectedMapPlace);
      mapPreviewOpacity.stopAnimation();
      mapPreviewOpacity.setValue(0);
      Animated.timing(mapPreviewOpacity, {
        duration: 180,
        toValue: 1,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!displayedMapPreviewPlace) {
      return;
    }

    mapPreviewOpacity.stopAnimation();
    Animated.timing(mapPreviewOpacity, {
      duration: 150,
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || selectedMapPlace !== null) {
        return;
      }

      setDisplayedMapPreviewPlace(null);
    });
  }, [displayedMapPreviewPlace, mapPreviewOpacity, selectedMapPlace, showMapBrowse]);

  useLayoutEffect(() => {
    if (!browseModeFadePendingRef.current) {
      return;
    }

    browseModeFadePendingRef.current = false;
    browseModeTransition.stopAnimation();
    Animated.timing(browseModeTransition, {
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      toValue: browseMode === 'map' ? 1 : 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || browseMode !== 'list' || !pendingListRevealRef.current) {
        return;
      }

      pendingListRevealRef.current = false;
      setListRevealEnabled(true);
      setListRevealToken((current) => current + 1);
    });
  }, [browseMode, browseModeTransition]);

  function handleRefreshPlaces() {
    animateNextLayout();
    setErrorMessage(null);
    setBrowseFiltersExpanded(false);
    setPlaces([]);
    setProfilePlaces([]);
    setSelectedMapPlaceKey(null);
    setSelectedPlaceSlug(null);
    setSelectedPlace(null);
    setSelectedLocationId(null);
    setApiBaseUrl(getDefaultApiBaseUrl());
    setReloadCount((current) => current + 1);
    setMapRegion(clampRegionToBounds(defaultMapRegion));
  }

  function handleSelectPlace(place: { slug: string; locationId?: number }) {
    animateNextLayout();
    startTransition(() => {
      setBrowseFiltersExpanded(false);
      setSelectedMapPlaceKey(null);
      setSelectedPlaceSlug(place.slug);
      setSelectedPlace(null);
      setSelectedLocationId(place.locationId ?? null);
    });
  }

  function handleToggleVenueType(venueType: VenueFilterValue) {
    setSelectedVenueTypes((current) => {
      const next = current.includes(venueType)
        ? current.filter((value) => value !== venueType)
        : [...current, venueType];

      return next.length ? next : [venueType];
    });
  }

  function handleSelectAllVenueTypes() {
    animateNextLayout();
    setSelectedVenueTypes(venueFilters.map((filter) => filter.value));
  }

  function handleToggleConfirmedDealsOnly() {
    animateNextLayout();
    setConfirmedDealsOnly((current) => !current);
  }

  function handleToggleOperatingDay(day: WeekdayFilterValue) {
    animateNextLayout();
    setSelectedOperatingDays((current) => toggleWeekdaySelection(current, day));
  }

  function handleToggleDealDay(day: WeekdayFilterValue) {
    animateNextLayout();
    setSelectedDealDays((current) => toggleWeekdaySelection(current, day));
  }

  function handleToggleVerifiedBusinessesOnly() {
    animateNextLayout();
    setVerifiedBusinessesOnly((current) => !current);
  }

  function handleToggleMapTheme() {
    const nextDarkMode = !darkMapMode;
    setDarkMapMode(nextDarkMode);
    setDisplayedDarkMapMode(nextDarkMode);
    setTransitioningMapTheme(null);
    mapThemeFade.stopAnimation();
    mapThemeFade.setValue(0);
  }

  function handleBrowseModeChange(mode: BrowseMode) {
    if (guestMapOnlyMode && mode !== 'map') {
      return;
    }

    if (mode === browseMode) {
      return;
    }

    setBrowseFiltersExpanded(false);
    setSelectedMapPlaceKey(null);
    pendingListRevealRef.current = mode === 'list';
    setListRevealEnabled(false);
    browseModeTransition.stopAnimation();
    browseModeFadePendingRef.current = true;
    setBrowseMode(mode);
  }

  function handleToggleBrowseFilters() {
    setBrowseFiltersExpanded((current) => !current);
  }

  function handleChangeSearchQuery(value: string) {
    if (!normalizeSearchText(value).length) {
      if (!searchQuery.length) {
        return;
      }

      handleClearSearchQuery();
      return;
    }

    setSearchQuery(value);
  }

  function handleClearSearchQuery() {
    animateNextLayout();
    const clearedFilteredPlaces = getFilteredPlaces(places, {
      confirmedDealsOnly,
      searchQuery: '',
      selectedCity,
      selectedDealDays,
      selectedOperatingDays,
      selectedVenueTypes,
      verifiedBusinessesOnly,
    });
    const clearedMappedPlaces = getMappedPlacesForBrowse(clearedFilteredPlaces);

    pendingImmediateMapPinsRefreshRef.current = true;
    clearAutoFitMapRegionTimer();
    setSearchQuery('');
    setSelectedMapPlaceKey(null);
    mapResultsOpacity.stopAnimation();
    mapResultsOpacity.setValue(0);
    mapResultsExpandedProgress.stopAnimation();
    mapResultsExpandedProgress.setValue(1);
    setShowMapResultsCard(false);
    setMapResultsCollapsed(false);
    setRenderedMapSearchResults([]);
    setRenderedMapResultsKey('');
    setRenderedMapResultCount(0);
    setVisibleMapResultCount(0);
    setLoadingMoreMapResults(false);
    clearShowMoreMapResultsTimer();

    if (showMapBrowse && !listLoading) {
      const nextRegion = getBrowseMapRegion(selectedCity, clearedMappedPlaces);
      mapRegionRef.current = nextRegion;
      setMapRegion(nextRegion);
    }
  }

  function handleBackToBrowse() {
    animateNextLayout();
    Keyboard.dismiss();
    setSelectedPlaceSlug(null);

    if (screenMode === 'profiles') {
      setProfileEntryOffset(0);
      profileSceneTransition.stopAnimation();
      profileSceneTransition.setValue(0);
      requestAnimationFrame(() => {
        Animated.timing(profileSceneTransition, {
          duration: 220,
          toValue: 1,
          useNativeDriver: true,
        }).start();
      });
    }
  }

  function handleOpenFavoriteBusiness(slug: string) {
    animateNextLayout();
    Keyboard.dismiss();
    setErrorMessage(null);
    setSelectedMapPlaceKey(null);
    setSelectedLocationId(null);
    setSelectedPlace(null);
    setSelectedPlaceSlug(slug);
  }

  async function handleToggleFavoriteBusiness() {
    if (!selectedPlace) {
      return;
    }

    if (!authenticatedSession?.auth_token) {
      setShowGuestFavoritePrompt(true);
      return;
    }

    if (authenticatedSession.portal !== 'customer') {
      setErrorMessage('Only customer accounts can favorite businesses.');
      setProfileErrorMessage(null);
      return;
    }

    setFavoriteSubmitting(true);
    setErrorMessage(null);
    setProfileErrorMessage(null);

    try {
      const response = await toggleFavoriteBusiness(apiBaseUrl, authenticatedSession.auth_token, {
        slug: selectedPlace.slug,
        favorited: !selectedPlaceIsFavorited,
        portal: authenticatedSession.portal,
      });
      setAuthenticatedSession(response);
      setProfileMessage(response.detail ?? null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setFavoriteSubmitting(false);
    }
  }

  function handleOpenProfiles() {
    dismissKeyboardForScreenTransition();
    setGuestBrowseModeLocked(false);
    setShowGuestFavoritePrompt(false);
    setProfileErrorMessage(null);
    setPendingEmailVerification(null);
    setEmailVerificationCode('');
    if (authenticatedSession && screenMode === 'browse' && !selectedPlaceSlug) {
      navigateBrowseProfileTransition('profiles');
      return;
    }

    if (authenticatedSession && screenMode === 'browse') {
      setProfileEntryOffset(width);
    }
    navigateScreen('profiles', 'forward');
  }

  function handleOpenAuthFromLanding(portal: AuthPortal) {
    dismissKeyboardForScreenTransition();
    setGuestBrowseModeLocked(false);
    setShowGuestFavoritePrompt(false);
    setAuthPortal(portal);
    setAuthMessage(null);
    setProfileErrorMessage(null);
    setProfileMessage(null);
    setPendingEmailVerification(null);
    setEmailVerificationCode('');
    setShouldAutoFocusLoginField(true);
    setShowLoginTwoFactorCodeField(false);
    setLoginForm(initialLoginFormState);
    navigateScreen('auth', 'forward');
  }

  function handleBackToLanding() {
    dismissKeyboardForScreenTransition();
    setShowGuestFavoritePrompt(false);
    setAuthMessage(null);
    setProfileErrorMessage(null);
    setShouldAutoFocusLoginField(false);
    setShowLoginTwoFactorCodeField(false);
    setLoginForm(initialLoginFormState);
    navigateScreen('splash', 'backward');
  }

  function handleExitGuestMap() {
    dismissKeyboardForScreenTransition();
    navigateGuestBrowseTransition('splash', () => {
      setShowGuestFavoritePrompt(false);
      setBrowseFiltersExpanded(false);
      setSelectedMapPlaceKey(null);
      setDisplayedMapPreviewPlace(null);
      setSelectedPlaceSlug(null);
      setSelectedLocationId(null);
      setGuestBrowseModeLocked(false);
      handleBrowseModeChange('list');
    });
  }

  function handleContinueToApp() {
    dismissKeyboardForScreenTransition();
    setAuthMessage(null);
    setProfileErrorMessage(null);
    if (authenticatedSession && screenMode === 'profiles') {
      navigateBrowseProfileTransition('browse');
      return;
    }

    setBrowseEntryOffset(-width);
    navigateScreen('browse', 'forward');
  }

  function handleOpenMapFromSplash() {
    setGuestBrowseModeLocked(true);
    handleBrowseModeChange('map');
    navigateGuestBrowseTransition('browse');
  }

  function handleDismissGuestFavoritePrompt() {
    setShowGuestFavoritePrompt(false);
  }

  function handleCreateCustomerAccountFromGuestFavorite() {
    setShowGuestFavoritePrompt(false);
    setSelectedPlaceSlug(null);
    setSelectedLocationId(null);
    handleOpenProfiles();
  }

  function handleBackFromProfiles() {
    dismissKeyboardForScreenTransition();
    if (authenticatedSession) {
      navigateBrowseProfileTransition('browse');
      return;
    }
    navigateScreen('splash', 'backward');
  }

  function handleOpenSupport() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    setProfileMessage(null);
    setSupportDraftContext(null);
    navigateScreen('support', 'forward');
  }

  function handleBackFromSupport() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('settings', 'backward');
  }

  function handleOpenSettings() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    setProfileMessage(null);
    navigateScreen('settings', 'forward');
  }

  function handleBackFromSettings() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('profiles', 'backward');
  }

  function handleOpenPrivacyPolicy() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('privacy-policy', 'forward');
  }

  function handleOpenTermsOfService() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('terms-of-service', 'forward');
  }

  function handleBackToSettings() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('settings', 'backward');
  }

  function handleOpenSupportWithDraft(subject: string, message: string) {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    setProfileMessage(null);
    setSupportDraftContext({ subject, message });
    navigateScreen('support', 'forward');
  }

  function handleChangeLoginField(field: keyof LoginFormState, value: string) {
    if (field === 'identifier') {
      setShowLoginTwoFactorCodeField(false);
      setLoginForm((current) => ({ ...current, identifier: value, two_factor_code: '' }));
      return;
    }

    setLoginForm((current) => ({ ...current, [field]: value }));
  }

  function handleSelectAuthPortal(portal: AuthPortal) {
    setAuthPortal(portal);
    setShowLoginTwoFactorCodeField(false);
    setLoginForm((current) => ({ ...current, two_factor_code: '' }));
  }

  function handleChangeProfileField(field: keyof ProfileFormState, value: string) {
    setProfileForm((current) => {
      if (field === 'business_city') {
        const servesMultipleAreas = value === multipleAreasBusinessCityValue;
        return {
          ...current,
          business_city: value,
          address_not_applicable: servesMultipleAreas,
          employer_address: servesMultipleAreas ? '' : current.employer_address,
        };
      }

      return { ...current, [field]: value };
    });
  }

  function handleChangeProfileToggle(field: 'address_not_applicable', value: boolean) {
    setProfileForm((current) => ({ ...current, [field]: value }));
  }

  async function handleAddBusinessAttachments(kind: BusinessAttachmentKind) {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: kind === 'social_media' ? '*/*' : verificationAttachmentMimeTypes,
      });

      if (result.canceled) {
        return;
      }

      const nextAttachments = result.assets.map(normalizeBusinessAttachment);
      setBusinessAttachments((current) => ({
        ...current,
        [kind]: mergeBusinessAttachments(current[kind], nextAttachments),
      }));
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    }
  }

  function handleRemoveBusinessAttachment(kind: BusinessAttachmentKind, attachmentId: string) {
    setBusinessAttachments((current) => ({
      ...current,
      [kind]: current[kind].filter((attachment) => attachment.id !== attachmentId),
    }));
  }

  function handleSelectBusinessSlug(slug: string) {
    const selectedPlace = availableProfilePlaces.find((place) => place.slug === slug) ?? null;
    setSelectedClaimPlace(selectedPlace);
    setProfileForm((current) => ({
      ...current,
      business_slug: slug,
      business_name: selectedPlace?.name ?? current.business_name,
      business_city: selectedPlace?.city ?? current.business_city,
      business_venue_type: selectedPlace?.venue_type ?? current.business_venue_type,
      business_website_url: selectedPlace?.website_url ?? current.business_website_url,
      address_not_applicable: false,
    }));
  }

  function moveToEmailVerification(response: EmailVerificationChallengeResponse, direction: OnboardingTransitionDirection = 'forward') {
    dismissKeyboardForScreenTransition();
    setAuthenticatedSession(null);
    setPendingEmailVerification(response);
    setEmailVerificationCode('');
    setAuthPortal(response.portal);
    setAuthMessage(null);
    setProfileErrorMessage(null);
    setProfileMessage(response.detail ?? `Enter the code we sent to ${response.email}.`);
    setShowLoginTwoFactorCodeField(false);
    setLoginForm(initialLoginFormState);
    navigateScreen('email-verification', direction);
  }

  function moveToBusinessClaimReviewPending(response: SignupResponse, direction: OnboardingTransitionDirection = 'forward') {
    dismissKeyboardForScreenTransition();
    setPendingEmailVerification(null);
    setEmailVerificationCode('');
    setAuthenticatedSession(response);
    setAuthPortal(response.portal);
    setAuthMessage(null);
    setProfileErrorMessage(null);
    setProfileMessage(response.claim_review_message ?? 'DiningDealz has received your business profile creation claim.');
    setShowLoginTwoFactorCodeField(false);
    setLoginForm(initialLoginFormState);
    navigateScreen('business-claim-review-pending', direction);
  }

  function handleBusinessSignupResponse(response: EmailVerificationChallengeResponse) {
    if (response.email_verification_required) {
      moveToEmailVerification(response);
      return;
    }

    if (!response.auth_token && response.claim_review_pending) {
      moveToBusinessClaimReviewPending(response);
      return;
    }

    setAuthenticatedSession(response);
    setPendingEmailVerification(null);
    setAuthPortal(response.portal);
    setAuthMessage(null);
    setProfileErrorMessage(null);
    setProfileMessage(response.detail ?? 'Business profile submitted successfully.');
    navigateScreen('profiles', 'forward');
  }

  async function handleLogin() {
    setLoginSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const payload: LoginRequest = {
        portal: authPortal,
        identifier: loginForm.identifier,
        password: loginForm.password,
        two_factor_code: loginForm.two_factor_code.trim(),
      };
      const response = await loginProfile(apiBaseUrl, payload);
      if (response.email_verification_required) {
        moveToEmailVerification(response);
        return;
      }
      if (!response.auth_token && response.claim_review_pending) {
        moveToBusinessClaimReviewPending(response);
        return;
      }

      setAuthenticatedSession(response);
      setPendingEmailVerification(null);
      setAuthMessage(null);
      setShowLoginTwoFactorCodeField(false);
      setLoginForm(initialLoginFormState);
      setProfileMessage('Signed in successfully.');
      startLoginSuccessTransition();
    } catch (error) {
      const message = getErrorMessage(error);
      const requiresTwoFactorCode = message.includes('two_factor_code:');

      if (requiresTwoFactorCode) {
        setShowLoginTwoFactorCodeField(true);
      }

      setProfileErrorMessage(requiresTwoFactorCode ? message.replace(/^two_factor_code:\s*/i, '') : message);
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleSubmitEmailVerificationCode() {
    if (!pendingEmailVerification) {
      return;
    }

    if (emailVerificationCode.trim().length !== 6) {
      setProfileErrorMessage('Enter the 6-digit verification code.');
      return;
    }

    setProfileSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await verifyEmailCode(apiBaseUrl, {
        username: pendingEmailVerification.username,
        code: emailVerificationCode,
        portal: pendingEmailVerification.portal,
      });
      if (!response.auth_token && response.claim_review_pending) {
        moveToBusinessClaimReviewPending(response);
        return;
      }
      dismissKeyboardForScreenTransition();
      setPendingEmailVerification(null);
      setEmailVerificationCode('');
      setAuthenticatedSession(response);
      setProfileMessage('Email verified successfully.');
      navigateScreen('profiles', 'forward');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleResendEmailVerificationCode() {
    if (!pendingEmailVerification) {
      return;
    }

    setProfileSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await resendVerificationCode(apiBaseUrl, {
        username: pendingEmailVerification.username,
        portal: pendingEmailVerification.portal,
      });
      setPendingEmailVerification(response);
      setEmailVerificationCode('');
      setProfileMessage(response.detail ?? `A new verification code was sent to ${response.email}.`);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleForgotUsername(email: string) {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
	  setProfileErrorMessage('Enter the email address for your account.');
      return;
    }

    setLoginSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await requestUsernameReminder(apiBaseUrl, normalizedEmail);
      setAuthMessage(response.detail);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleForgotPassword(identifier: string) {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
	  setProfileErrorMessage('Enter your username or email for password recovery.');
      return;
    }

    setLoginSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await requestPasswordReset(apiBaseUrl, normalizedIdentifier);
      setAuthMessage(response.detail);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleSubmitCustomerProfile() {
    if (profileForm.password !== profileForm.confirm_password) {
      setProfileErrorMessage('Password and confirm password must match.');
      setProfileMessage(null);
      return;
    }

    setProfileSubmitting(true);
    setProfileErrorMessage(null);
    setProfileMessage(null);

    try {
      const payload: CustomerSignupRequest = {
        username: profileForm.username,
        email: profileForm.email,
        password: profileForm.password,
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
      };
      const response = await createCustomerProfile(apiBaseUrl, payload);
      setProfileForm(initialProfileFormState);
      moveToEmailVerification(response);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleSubmitClaimedBusinessProfile() {
    if (profileForm.password !== profileForm.confirm_password) {
      setProfileErrorMessage('Password and confirm password must match.');
      setProfileMessage(null);
      return;
    }

    setProfileSubmitting(true);
    setProfileErrorMessage(null);
    setProfileMessage(null);

    try {
      const payload: BusinessSignupRequest = {
        username: profileForm.username,
        email: profileForm.email,
        password: profileForm.password,
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        attachments: businessAttachments,
        ...buildSharedBusinessDetails(profileForm),
        business_slug: profileForm.business_slug,
        contact_name: profileForm.contact_name,
        job_title: profileForm.job_title,
        work_email: profileForm.work_email,
        work_phone: profileForm.work_phone,
        employer_address: profileForm.employer_address,
        address_not_applicable: false,
        verification_documents: buildVerificationDocuments(),
        supporting_details: profileForm.supporting_details,
      };
      const response = await createBusinessProfile(apiBaseUrl, payload);
      setProfileForm(initialProfileFormState);
      setBusinessAttachments(initialBusinessAttachments);
      setSelectedClaimPlace(null);
      setSelectedClaimLocationId(null);
      handleBusinessSignupResponse(response);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleSubmitManualBusinessProfile() {
    if (profileForm.password !== profileForm.confirm_password) {
      setProfileErrorMessage('Password and confirm password must match.');
      setProfileMessage(null);
      return;
    }

    setProfileSubmitting(true);
    setProfileErrorMessage(null);
    setProfileMessage(null);

    const servesMultipleAreas = profileForm.business_city === multipleAreasBusinessCityValue;

    try {
      const payload: ManualBusinessSignupRequest = {
        username: profileForm.username,
        email: profileForm.email,
        password: profileForm.password,
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        attachments: businessAttachments,
        ...buildSharedBusinessDetails(profileForm),
        business_name: profileForm.business_name,
        business_city: profileForm.business_city,
        business_venue_type: profileForm.business_venue_type,
        contact_name: profileForm.contact_name,
        job_title: profileForm.job_title,
        work_email: profileForm.work_email,
        work_phone: profileForm.work_phone,
        employer_address: profileForm.employer_address,
        address_not_applicable: servesMultipleAreas ? true : profileForm.address_not_applicable,
        verification_documents: buildVerificationDocuments(),
        supporting_details: profileForm.supporting_details,
      };
      const response = await createManualBusinessProfile(apiBaseUrl, payload);
      setProfileForm(initialProfileFormState);
      setBusinessAttachments(initialBusinessAttachments);
      setSelectedClaimPlace(null);
      setSelectedClaimLocationId(null);
      handleBusinessSignupResponse(response);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleSubmitInformalBusinessProfile() {
    if (profileForm.password !== profileForm.confirm_password) {
      setProfileErrorMessage('Password and confirm password must match.');
      setProfileMessage(null);
      return;
    }

    setProfileSubmitting(true);
    setProfileErrorMessage(null);
    setProfileMessage(null);

    try {
      const payload: InformalBusinessSignupRequest = {
        username: profileForm.username,
        email: profileForm.email,
        password: profileForm.password,
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        attachments: businessAttachments,
        ...buildSharedBusinessDetails(profileForm),
        business_name: profileForm.business_name,
        business_city: profileForm.business_city,
        business_venue_type: profileForm.business_venue_type,
        supporting_details: profileForm.supporting_details,
      };
      const response = await createInformalBusinessProfile(apiBaseUrl, payload);
      setProfileForm(initialProfileFormState);
      setBusinessAttachments(initialBusinessAttachments);
      setSelectedClaimPlace(null);
      setSelectedClaimLocationId(null);
      handleBusinessSignupResponse(response);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function refreshDashboard(showSpinner = true) {
    if (!authenticatedSession?.auth_token) {
      return;
    }

    if (showSpinner) {
      setDashboardLoading(true);
    }
    setProfileErrorMessage(null);

    try {
      const response = await fetchProfileDashboard(apiBaseUrl, authenticatedSession.auth_token, authenticatedSession.portal);
      setAuthenticatedSession(response);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      if (showSpinner) {
        setDashboardLoading(false);
      }
    }
  }

  async function handleResendVerification() {
    if (!authenticatedSession?.auth_token) {
      return;
    }

    setDashboardSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await resendVerificationEmail(apiBaseUrl, authenticatedSession.auth_token);
      setProfileMessage(response.detail);
      await refreshDashboard(false);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setDashboardSubmitting(false);
    }
  }

  async function handleBeginTwoFactorSetup() {
    if (!authenticatedSession?.auth_token) {
      return;
    }

    setDashboardSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await beginTwoFactorSetup(apiBaseUrl, authenticatedSession.auth_token);
      setTwoFactorSetup(response);
      setTwoFactorSetupCode('');
      setProfileMessage(response.detail);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setDashboardSubmitting(false);
    }
  }

  async function handleConfirmTwoFactorSetup() {
    if (!authenticatedSession?.auth_token || !twoFactorSetup) {
      return;
    }

    setDashboardSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await confirmTwoFactorSetup(apiBaseUrl, authenticatedSession.auth_token, twoFactorSetupCode, authenticatedSession.portal);
      setAuthenticatedSession(response);
      setTwoFactorSetup(null);
      setTwoFactorSetupCode('');
      setProfileMessage('Authenticator-based 2FA enabled. Use your authenticator code every time you sign in.');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setDashboardSubmitting(false);
    }
  }

  async function handleDisableTwoFactor() {
    if (!authenticatedSession?.auth_token) {
      return;
    }

    setDashboardSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await disableTwoFactor(apiBaseUrl, authenticatedSession.auth_token, twoFactorDisableCode, authenticatedSession.portal);
      setAuthenticatedSession(response);
      setTwoFactorDisableCode('');
      setTwoFactorSetup(null);
      setTwoFactorSetupCode('');
      setProfileMessage('Authenticator-based 2FA disabled.');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setDashboardSubmitting(false);
    }
  }

  async function handleToggleBusinessLocationTracking(enabled: boolean) {
    if (!authenticatedSession?.auth_token || authenticatedSession.portal !== 'business') {
      return;
    }

    setDashboardSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await updateBusinessLocationTrackingPreference(apiBaseUrl, authenticatedSession.auth_token, { enabled });
      setAuthenticatedSession(response);
      setProfileMessage(enabled
        ? 'Business location services turned on.'
        : 'Business location services turned off. Live pin updates have stopped.');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setDashboardSubmitting(false);
    }
  }

  async function handleSaveProfileDetails(payload: ProfileDashboardUpdateRequest) {
    if (!authenticatedSession?.auth_token) {
      return;
    }

    setDashboardSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await updateProfileDashboard(apiBaseUrl, authenticatedSession.auth_token, payload);
      setAuthenticatedSession(response);
      setProfileMessage(response.detail ?? 'Profile updated.');
      if (response.email_verified === false && payload.email !== authenticatedSession.email) {
        setTwoFactorSetup(null);
        setTwoFactorSetupCode('');
      }
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setDashboardSubmitting(false);
    }
  }

  function handleLogout() {
    setProfileMessage(null);
    setProfileErrorMessage(null);
    setAuthMessage('You have been signed out.');
    setShouldAutoFocusLoginField(false);
    setTwoFactorSetup(null);
    setTwoFactorSetupCode('');
    setTwoFactorDisableCode('');
    startLogoutTransition();
  }

  function handleOpenBilling() {
    if (!authenticatedSession?.billing_portal_url) {
      return;
    }

    void Linking.openURL(authenticatedSession.billing_portal_url);
  }

  function handleOpenBusinessSearch() {
    dismissKeyboardForScreenTransition();
    claimPrefillRequestRef.current += 1;
    claimPrefillLoadedKeyRef.current = '';
    setProfileErrorMessage(null);
    setBusinessSearchQuery('');
    setSelectedClaimLocationId(null);
    navigateScreen('business-search', 'forward');
  }

  function handleBackToCreateProfile() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('profiles', 'backward');
  }

  function handleBackFromEmailVerification() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    setProfileMessage(null);
    setEmailVerificationCode('');
    navigateScreen('auth', 'backward');
  }

  function handleBackFromBusinessClaimReviewPending() {
    dismissKeyboardForScreenTransition();
    setAuthenticatedSession(null);
    setProfileErrorMessage(null);
    setProfileMessage(null);
    navigateScreen('auth', 'backward');
  }

  function handleBackToBusinessSearch() {
    dismissKeyboardForScreenTransition();
    claimPrefillRequestRef.current += 1;
    claimPrefillLoadedKeyRef.current = '';
    setProfileErrorMessage(null);
    navigateScreen('business-search', 'backward');
  }

  function handleOpenManualBusinessClaim() {
    dismissKeyboardForScreenTransition();
    claimPrefillRequestRef.current += 1;
    claimPrefillLoadedKeyRef.current = '';
    setProfileErrorMessage(null);
    setSelectedClaimPlace(null);
    setSelectedClaimLocationId(null);
    setBusinessAttachments(initialBusinessAttachments);
    setProfileForm((current) => resetBusinessVerificationFields(current));
    navigateScreen('manual-business-claim', 'forward');
  }

  function handleOpenInformalBusinessClaim() {
    dismissKeyboardForScreenTransition();
    claimPrefillRequestRef.current += 1;
    claimPrefillLoadedKeyRef.current = '';
    setProfileErrorMessage(null);
    setSelectedClaimPlace(null);
    setSelectedClaimLocationId(null);
    setBusinessAttachments(initialBusinessAttachments);
    setProfileForm((current) => resetBusinessVerificationFields(current));
    navigateScreen('informal-business-claim', 'forward');
  }

  function handleSelectClaimBusiness(place: PlaceListItem, locationId: number) {
    dismissKeyboardForScreenTransition();
    const selectedLocation = getPlaceLocations(place).find((location) => location.id === locationId) ?? getPlaceLocations(place)[0] ?? place;
    claimPrefillLoadedKeyRef.current = '';
    setSelectedClaimPlace(place);
    setSelectedClaimLocationId(selectedLocation.id);
    setBusinessAttachments(initialBusinessAttachments);
    setProfileForm((current) => ({
      ...resetBusinessVerificationFields(current),
      business_slug: place.slug,
      business_name: place.name,
      business_city: selectedLocation.city,
      business_venue_type: place.venue_type,
      business_website_url: selectedLocation.website_url,
      address_not_applicable: false,
    }));
    navigateScreen('business-claim', 'forward');
  }

  function handleClearMapSelection() {
    if (showMapBrowse && normalizedSearchQuery.length > 0) {
      mapResultsOpacity.stopAnimation();
      mapResultsOpacity.setValue(1);
      setShowMapResultsCard(true);
    }

    setSelectedMapPlaceKey(null);
  }

  function handleSelectMapPin(placeKey: string) {
    mapResultsOpacity.stopAnimation();
    mapResultsOpacity.setValue(1);
    setShowMapResultsCard(false);
    setSelectedMapPlaceKey(placeKey);
  }

  function handleFocusMapResult(place: MappedPlace) {
    mapResultsOpacity.stopAnimation();
    mapResultsOpacity.setValue(0);
    setShowMapResultsCard(false);
    setSelectedMapPlaceKey(place.markerKey);
    const currentMapRegion = mapRegionRef.current;
    const nextRegion = clampRegionToBounds({
      latitude: place.latitude,
      longitude: place.longitude,
      latitudeDelta: Math.min(currentMapRegion.latitudeDelta, 0.04),
      longitudeDelta: Math.min(currentMapRegion.longitudeDelta, 0.04),
    });

    mapRegionRef.current = nextRegion;
    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 250);
  }

  const mapResultsCardAnimatedMaxHeight = mapResultsExpandedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [92, mapResultsCardMaxHeight],
  });
  const mapResultsContentOpacity = mapResultsExpandedProgress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.18, 1],
  });
  const mapResultsContentTranslateY = mapResultsExpandedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });
  const mapResultsChevronLeftRotate = mapResultsExpandedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['45deg', '-45deg'],
  });
  const mapResultsChevronRightRotate = mapResultsExpandedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-45deg', '45deg'],
  });
  const mapResultsChevronArmOffset = mapResultsExpandedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, -1],
  });

  function renderProfilesScreen(profileSessionOverride?: SignupResponse | null, targetScreenOverride?: AppScreenMode) {
    const profileSession = profileSessionOverride ?? authenticatedSession;
    const targetScreen = targetScreenOverride ?? screenMode;

    if (targetScreen === 'support' && profileSession) {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <ContactSupportScreen
            errorMessage={profileErrorMessage}
            initialMessage={supportDraftContext?.message}
            initialSubject={supportDraftContext?.subject}
            isLandscape={isLandscape}
            onBack={handleBackFromSupport}
            session={profileSession}
          />
        </SafeAreaView>
      );
    }

    if (targetScreen === 'privacy-policy' && profileSession) {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <PrivacyPolicyScreen isLandscape={isLandscape} onBack={handleBackToSettings} />
        </SafeAreaView>
      );
    }

    if (targetScreen === 'terms-of-service' && profileSession) {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <TermsOfServiceScreen isLandscape={isLandscape} onBack={handleBackToSettings} />
        </SafeAreaView>
      );
    }

    if (targetScreen === 'settings' && profileSession) {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <AccountSettingsScreen
            errorMessage={profileErrorMessage}
            isLandscape={isLandscape}
            message={profileMessage}
            onBack={handleBackFromSettings}
            onBeginTwoFactorSetup={() => void handleBeginTwoFactorSetup()}
            onChangeTwoFactorDisableCode={setTwoFactorDisableCode}
            onChangeTwoFactorSetupCode={setTwoFactorSetupCode}
            onConfirmTwoFactorSetup={() => void handleConfirmTwoFactorSetup()}
            onDisableTwoFactor={() => void handleDisableTwoFactor()}
            onLogout={handleLogout}
            onToggleBusinessLocationTracking={(value) => void handleToggleBusinessLocationTracking(value)}
            onOpenContactSupport={handleOpenSupport}
            onOpenDisableAccountRequest={() => handleOpenSupportWithDraft(
              'Disable my DiningDealz account',
              'Please disable my DiningDealz account. I understand this request is processed by the support team after account-owner verification.',
            )}
            onOpenPrivacyPolicy={handleOpenPrivacyPolicy}
            onOpenTermsOfService={handleOpenTermsOfService}
            onOpenDeleteAccountRequest={() => handleOpenSupportWithDraft(
              'Delete my DiningDealz account',
              'Please permanently delete my DiningDealz account and associated profile data. I understand this request is processed by the support team after account-owner verification.',
            )}
            session={profileSession}
            submitting={dashboardSubmitting}
            twoFactorDisableCode={twoFactorDisableCode}
            twoFactorSetup={twoFactorSetup}
            twoFactorSetupCode={twoFactorSetupCode}
          />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        {profileSession ? (
          <DashboardScreen
            errorMessage={profileErrorMessage}
            isLandscape={isLandscape}
            loading={dashboardLoading}
            message={profileMessage}
            onBack={handleBackFromProfiles}
            onOpenBilling={handleOpenBilling}
            onOpenFavoriteBusiness={handleOpenFavoriteBusiness}
            onOpenPlaces={handleContinueToApp}
            onOpenSettings={handleOpenSettings}
            onRefresh={() => void refreshDashboard()}
            onResendVerification={() => void handleResendVerification()}
            onSaveProfileDetails={(payload) => void handleSaveProfileDetails(payload)}
            session={profileSession}
            submitting={dashboardSubmitting}
          />
        ) : (
          <CreateProfileScreen
            errorMessage={profileErrorMessage}
            form={profileForm}
            isLandscape={isLandscape}
            message={profileMessage}
            onBack={handleBackFromProfiles}
            onChangeField={handleChangeProfileField}
            onOpenBusinessClaim={handleOpenBusinessSearch}
            onSubmit={handleSubmitCustomerProfile}
            submitting={profileSubmitting}
          />
        )}
      </SafeAreaView>
    );
  }

  function renderProfilesScreenRoot() {
    const shouldShowBrowseOverlay = usesBrowseProfileSlideTransition
      && browseProfileTransitionFrom === 'profiles'
      && incomingBrowseProfileScreen === 'browse';

    return (
      <View style={[styles.fullScreenRoot, shouldShowBrowseOverlay ? styles.transitionClipRoot : null]}>
        <Animated.View style={[styles.screenTransitionLayerAbsolute, shouldShowBrowseOverlay ? browseProfileOutgoingStyle : null]}>
          {renderProfilesScreen()}
        </Animated.View>
        {shouldShowBrowseOverlay ? (
          <Animated.View style={[styles.screenTransitionLayerAbsolute, browseProfileIncomingStyle]}>
            {renderBrowseScreen({
              suppressBrowseSceneTransitionStyle: true,
              suppressScreenTransitionStyle: true,
              suppressTransitionOverlay: true,
            })}
          </Animated.View>
        ) : null}
      </View>
    );
  }

  function renderGuestMainShell() {
    const transitionActive = usesGuestBrowseSlideTransition;
    const showingSplash = screenMode === 'splash';
    const splashLayerStyle = transitionActive
      ? guestBrowseTransitionFrom === 'splash'
        ? guestBrowseOutgoingStyle
        : guestBrowseIncomingStyle
      : showingSplash
        ? null
        : { opacity: 0, transform: [{ translateX: width }] };
    const browseLayerStyle = transitionActive
      ? guestBrowseTransitionFrom === 'browse'
        ? guestBrowseOutgoingStyle
        : guestBrowseIncomingStyle
      : showingSplash
        ? { opacity: 0, transform: [{ translateX: -width }] }
        : null;

    return (
      <View style={[styles.fullScreenRoot, transitionActive ? styles.transitionClipRoot : null]}>
        <Animated.View
          pointerEvents={showingSplash && !transitionActive ? 'auto' : 'none'}
          style={[styles.screenTransitionLayerAbsolute, splashLayerStyle]}
        >
          {renderOnboardingScreen('splash')}
        </Animated.View>
        <Animated.View
          pointerEvents={!showingSplash && !transitionActive ? 'auto' : 'none'}
          style={[styles.screenTransitionLayerAbsolute, browseLayerStyle]}
        >
          {renderBrowseScreen({
            suppressBrowseSceneTransitionStyle: true,
            suppressScreenTransitionStyle: true,
            suppressTransitionOverlay: true,
          })}
        </Animated.View>
      </View>
    );
  }

  function renderAuthenticatedMainShell() {
    const transitionActive = usesBrowseProfileSlideTransition;
    const showingProfile = ['profiles', 'settings', 'support', 'privacy-policy', 'terms-of-service'].includes(screenMode);
    const profileLayerStyle = transitionActive
      ? browseProfileTransitionFrom === 'profiles'
        ? browseProfileOutgoingStyle
        : browseProfileIncomingStyle
      : showingProfile
        ? profileSceneTransitionStyle
        : { opacity: 0, transform: [{ translateX: width }] };
    const browseLayerStyle = transitionActive
      ? browseProfileTransitionFrom === 'browse'
        ? browseProfileOutgoingStyle
        : browseProfileIncomingStyle
      : showingProfile
        ? { opacity: 0, transform: [{ translateX: -width }] }
        : null;

    return (
      <View style={[styles.fullScreenRoot, transitionActive ? styles.transitionClipRoot : null]}>
        <Animated.View
          pointerEvents={showingProfile && !transitionActive ? 'auto' : 'none'}
          style={[styles.screenTransitionLayerAbsolute, profileLayerStyle]}
        >
          {renderProfilesScreen()}
        </Animated.View>
        <Animated.View
          pointerEvents={!showingProfile && !transitionActive ? 'auto' : 'none'}
          style={[styles.screenTransitionLayerAbsolute, browseLayerStyle]}
        >
          {renderBrowseScreen({
            suppressBrowseSceneTransitionStyle: true,
            suppressScreenTransitionStyle: true,
            suppressTransitionOverlay: true,
          })}
        </Animated.View>
      </View>
    );
  }

  function renderOnboardingScreen(targetScreen: AppScreenMode, profileSessionOverride?: SignupResponse | null) {
    switch (targetScreen) {
      case 'splash':
        return (
          <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
            <SplashScreen onCreateAccount={handleOpenProfiles} onOpenMap={handleOpenMapFromSplash} onSelectPortal={handleOpenAuthFromLanding} />
          </SafeAreaView>
        );
      case 'auth':
        return (
          <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
            <AuthPortalScreen
              authMessage={authMessage}
              autoFocusIdentifier={shouldAutoFocusLoginField}
              errorMessage={profileErrorMessage}
              loginForm={loginForm}
              loginPortal={authPortal}
              onBackToLanding={handleBackToLanding}
              onChangeField={handleChangeLoginField}
              onForgotPassword={(identifier) => void handleForgotPassword(identifier)}
	          onForgotUsername={(email) => void handleForgotUsername(email)}
              onSubmit={handleLogin}
              showTwoFactorCodeField={showLoginTwoFactorCodeField}
              submitting={loginSubmitting}
            />
          </SafeAreaView>
        );
      case 'profiles':
        return renderProfilesScreen(profileSessionOverride, 'profiles');
      case 'settings':
        return renderProfilesScreen(profileSessionOverride, 'settings');
      case 'support':
        return renderProfilesScreen(profileSessionOverride, 'support');
      case 'privacy-policy':
        return renderProfilesScreen(profileSessionOverride, 'privacy-policy');
      case 'terms-of-service':
        return renderProfilesScreen(profileSessionOverride, 'terms-of-service');
      case 'email-verification':
        return (
          <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
            <EmailVerificationScreen
              errorMessage={profileErrorMessage}
              isLandscape={isLandscape}
              message={profileMessage}
              onBack={handleBackFromEmailVerification}
              onChangeCode={setEmailVerificationCode}
              onResend={() => void handleResendEmailVerificationCode()}
              onSubmit={() => void handleSubmitEmailVerificationCode()}
              pendingVerification={pendingEmailVerification}
              submitting={profileSubmitting}
              verificationCode={emailVerificationCode}
            />
          </SafeAreaView>
        );
      case 'business-claim-review-pending':
        return (
          <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
            <BusinessClaimReviewPendingScreen
              errorMessage={profileErrorMessage}
              isLandscape={isLandscape}
              message={profileMessage}
              onBack={handleBackFromBusinessClaimReviewPending}
              session={authenticatedSession}
            />
          </SafeAreaView>
        );
      case 'business-search':
        return (
          <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
            <BusinessSearchScreen
              errorMessage={profileErrorMessage}
              isLandscape={isLandscape}
              loadingPlaces={profilePlacesLoading}
              onBack={handleBackToCreateProfile}
              onChangeSearchQuery={setBusinessSearchQuery}
              onChooseInformalBusiness={handleOpenInformalBusinessClaim}
              onChooseManualBusiness={handleOpenManualBusinessClaim}
              onSelectBusiness={handleSelectClaimBusiness}
              results={businessSearchResults}
              searchQuery={businessSearchQuery}
            />
          </SafeAreaView>
        );
      case 'business-claim':
        return (
          <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
            <BusinessVerificationScreen
              attachments={businessAttachments}
              errorMessage={profileErrorMessage}
              form={profileForm}
              isLandscape={isLandscape}
              mode="claimed"
              onAddAttachments={handleAddBusinessAttachments}
              onBack={handleBackToBusinessSearch}
              onChangeField={handleChangeProfileField}
              onRemoveAttachment={handleRemoveBusinessAttachment}
              onToggleAddressNotApplicable={(value) => handleChangeProfileToggle('address_not_applicable', value)}
              onSubmit={handleSubmitClaimedBusinessProfile}
              selectedLocation={selectedClaimLocation}
              selectedPlace={selectedClaimPlace}
              submitting={profileSubmitting}
            />
          </SafeAreaView>
        );
      case 'manual-business-claim':
        return (
          <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
            <BusinessVerificationScreen
              attachments={businessAttachments}
              errorMessage={profileErrorMessage}
              form={profileForm}
              isLandscape={isLandscape}
              mode="manual"
              onAddAttachments={handleAddBusinessAttachments}
              onBack={handleBackToBusinessSearch}
              onChangeField={handleChangeProfileField}
              onRemoveAttachment={handleRemoveBusinessAttachment}
              onToggleAddressNotApplicable={(value) => handleChangeProfileToggle('address_not_applicable', value)}
              onSubmit={handleSubmitManualBusinessProfile}
              selectedLocation={null}
              selectedPlace={null}
              submitting={profileSubmitting}
            />
          </SafeAreaView>
        );
      case 'informal-business-claim':
        return (
          <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
            <BusinessVerificationScreen
              attachments={businessAttachments}
              errorMessage={profileErrorMessage}
              form={profileForm}
              isLandscape={isLandscape}
              mode="informal"
              onAddAttachments={handleAddBusinessAttachments}
              onBack={handleBackToBusinessSearch}
              onChangeField={handleChangeProfileField}
              onRemoveAttachment={handleRemoveBusinessAttachment}
              onToggleAddressNotApplicable={(value) => handleChangeProfileToggle('address_not_applicable', value)}
              onSubmit={handleSubmitInformalBusinessProfile}
              selectedLocation={null}
              selectedPlace={null}
              submitting={profileSubmitting}
            />
          </SafeAreaView>
        );
      default:
        return null;
    }
  }

  function renderBrowseScreen(options?: { suppressScreenTransitionStyle?: boolean; suppressBrowseSceneTransitionStyle?: boolean; suppressTransitionOverlay?: boolean }) {
    const shouldShowProfileOverlay = !options?.suppressTransitionOverlay
      && usesBrowseProfileSlideTransition
      && browseProfileTransitionFrom === 'browse'
      && incomingBrowseProfileScreen === 'profiles';
    const browseScreenAnimationStyle = options?.suppressScreenTransitionStyle || shouldShowProfileOverlay ? null : screenTransitionStyle;
    const browseSceneAnimationStyle = options?.suppressBrowseSceneTransitionStyle || shouldShowProfileOverlay ? null : browseSceneTransitionStyle;

    return (
      <View style={[styles.fullScreenRoot, shouldShowProfileOverlay ? styles.transitionClipRoot : null]}>
        <Animated.View style={[
          styles.screenTransitionLayerAbsolute,
          styles.fullScreenRoot,
          browseScreenAnimationStyle,
          browseSceneAnimationStyle,
          shouldShowProfileOverlay ? browseProfileOutgoingStyle : null,
        ]}>
          <View style={styles.fullScreenRoot}>
            <Animated.View pointerEvents={browseMode === 'map' ? 'auto' : 'none'} style={[styles.mapModeContentLayer, browseModeTransitionStyle]}>
              <View style={styles.mapScreen}>
                <MapView
                  initialRegion={mapRegionRef.current}
                  maxDelta={maxMapGestureDelta}
                  minDelta={minLatitudeDelta}
                  userInterfaceStyle={Platform.OS === 'ios' ? (displayedDarkMapMode ? 'dark' : 'light') : undefined}
                  rotateEnabled={false}
                  mapType="standard"
                  onMapReady={() => {
                    if (!shouldUseNativeMapBoundaries || !mapRef.current) {
                      return;
                    }

                    mapRef.current.setMapBoundaries(
                      { latitude: mapAreaBounds.maxLatitude, longitude: mapAreaBounds.maxLongitude },
                      { latitude: mapAreaBounds.minLatitude, longitude: mapAreaBounds.minLongitude },
                    );
                  }}
                  onRegionChangeComplete={(nextRegion, details) => {
                    const normalizedRegion = normalizeRegion(nextRegion);
                    const boundedRegion = shouldUseNativeMapBoundaries
                      ? normalizedRegion
                      : clampRegionToBounds(normalizedRegion);

                    if (details.isGesture) {
                      clearAutoFitMapRegionTimer();
                    }

                        
                    if (details.isGesture) {
                      const shouldSnapToBounds = !shouldUseNativeMapBoundaries && shouldSnapRegionToBounds(normalizedRegion);
                      const nextControlledRegion = shouldSnapToBounds ? boundedRegion : normalizedRegion;

                      mapRegionRef.current = nextControlledRegion;
                      setMapRegion((currentRegion) => (
                        areRegionsEqual(currentRegion, nextControlledRegion) ? currentRegion : nextControlledRegion
                      ));

                      if (shouldSnapToBounds) {
                        mapRef.current?.animateToRegion(boundedRegion, 180);
                      }

                      return;
                    }

                    mapRegionRef.current = boundedRegion;

                    setMapRegion((currentRegion) => (
                      areRegionsEqual(currentRegion, boundedRegion) ? currentRegion : boundedRegion
                    ));

                    if (!shouldUseNativeMapBoundaries && shouldSnapRegionToBounds(nextRegion)) {
                      mapRef.current?.animateToRegion(boundedRegion, 180);
                    }
                  }}
                  onPress={(event) => {
                    Keyboard.dismiss();
                    if (event.nativeEvent.action === 'marker-press') {
                      return;
                    }

                    handleClearMapSelection();
                  }}
                  ref={mapRef}
                  style={styles.mapBackground}
                >
                  {displayedMapPlaces.map((place, index) => {
                    const markerStyle = getVenueMarkerStyle(place.venue_type);
                    const animatedMarkerStyle = getAnimatedMapMarkerStyle(place, mapRegion, width, height, mapPinsTransition);

                    return (
                      <Marker
                        anchor={{ x: 0.5, y: 0.5 }}
                        coordinate={{ latitude: place.markerLatitude, longitude: place.markerLongitude }}
                        key={place.markerKey}
                        onPress={() => handleSelectMapPin(place.markerKey)}
                          tracksViewChanges={mapMarkersTrackViewChanges}
                        zIndex={displayedMapPlaces.length - index}
                      >
                        <Animated.View style={[
                          animatedMarkerStyle,
                          styles.mapMarker,
                          { backgroundColor: markerStyle.fill, borderColor: markerStyle.stroke },
                          selectedMapPlaceKey === place.markerKey ? styles.mapMarkerActive : null,
                        ]}>
                          <Text style={styles.mapMarkerText}>{markerStyle.badge}</Text>
                        </Animated.View>
                      </Marker>
                    );
                  })}
                </MapView>

                {Platform.OS === 'ios' && transitioningMapTheme !== null ? (
                  <Animated.View pointerEvents="none" style={[styles.mapThemeTransitionLayer, { opacity: mapThemeFade }]}>
                    <MapView
                      mapType="standard"
                      region={mapRegion}
                      rotateEnabled={false}
                      scrollEnabled={false}
                      showsCompass={false}
                      showsMyLocationButton={false}
                      toolbarEnabled={false}
                      userInterfaceStyle={transitioningMapTheme ? 'dark' : 'light'}
                      zoomEnabled={false}
                      style={styles.mapBackground}
                    >
                      {displayedMapPlaces.map((place, index) => {
                        const markerStyle = getVenueMarkerStyle(place.venue_type);
                        const animatedMarkerStyle = getAnimatedMapMarkerStyle(place, mapRegion, width, height, mapPinsTransition);

                        return (
                          <Marker
                            anchor={{ x: 0.5, y: 0.5 }}
                            coordinate={{ latitude: place.markerLatitude, longitude: place.markerLongitude }}
                            key={`transition-${place.markerKey}`}
                            tracksViewChanges={mapMarkersTrackViewChanges}
                            zIndex={displayedMapPlaces.length - index}
                          >
                            <Animated.View style={[
                              animatedMarkerStyle,
                              styles.mapMarker,
                              { backgroundColor: markerStyle.fill, borderColor: markerStyle.stroke },
                              selectedMapPlaceKey === place.markerKey ? styles.mapMarkerActive : null,
                            ]}>
                              <Text style={styles.mapMarkerText}>{markerStyle.badge}</Text>
                            </Animated.View>
                          </Marker>
                        );
                      })}
                    </MapView>
                  </Animated.View>
                ) : null}
              </View>
            </Animated.View>

            <SafeAreaView edges={['top', 'left', 'right']} pointerEvents="box-none" style={styles.safeAreaTransparent}>
              <View pointerEvents="box-none" style={[styles.screen, isLandscape ? styles.screenLandscape : null]}>
                <BrowseControls
                  browseMode={browseMode}
                  confirmedDealsOnly={confirmedDealsOnly}
                  filtersExpanded={browseFiltersExpanded}
                  isDarkMapMode={darkMapMode}
                  listModeEnabled={!guestMapOnlyMode}
                  onChangeSearchQuery={handleChangeSearchQuery}
                  onClearSearchQuery={handleClearSearchQuery}
                  onBrowseModeChange={handleBrowseModeChange}
                  onOpenDashboard={authenticatedSession && browseMode === 'list' ? handleOpenProfiles : undefined}
                  onReload={handleRefreshPlaces}
                  onSelectAllVenueTypes={handleSelectAllVenueTypes}
                  onSelectCity={setSelectedCity}
                  onToggleConfirmedDealsOnly={handleToggleConfirmedDealsOnly}
                  onToggleDealDay={handleToggleDealDay}
                  onToggleFilters={handleToggleBrowseFilters}
                  onToggleMapTheme={browseMode === 'map' ? handleToggleMapTheme : undefined}
                  onToggleOperatingDay={handleToggleOperatingDay}
                  onToggleVenueType={handleToggleVenueType}
                  onToggleVerifiedBusinessesOnly={handleToggleVerifiedBusinessesOnly}
                  resultCount={browseResultCount}
                  searchQuery={searchQuery}
                  selectedDealDays={selectedDealDays}
                  selectedCity={selectedCity}
                  selectedOperatingDays={selectedOperatingDays}
                  selectedVenueTypes={selectedVenueTypes}
                  verifiedBusinessesOnly={verifiedBusinessesOnly}
                />

                <View style={styles.browseContentStage}>
                  <Animated.View pointerEvents={browseMode === 'map' ? 'box-none' : 'none'} style={[styles.browseContentFill, styles.mapOverlayContentLayer, browseModeTransitionStyle]}>
                    {listLoading ? (
                      <View style={styles.mapLoadingOverlay}>
                        <ActivityIndicator color="#c65d1f" size="large" />
                        <Text style={styles.mapOverlayText}>Loading places...</Text>
                      </View>
                    ) : null}

                    {displayedMapPreviewPlace ? (
                      <Animated.View style={[styles.mapPreviewCard, isLandscape ? styles.mapPreviewCardLandscape : null, { opacity: mapPreviewOpacity }]}>
                        <View style={styles.mapPreviewHeader}>
                          <View style={styles.mapPreviewCopy}>
                            <Text style={[styles.mapPreviewTitle, isLandscape ? styles.mapPreviewTitleLandscape : null]}>{displayedMapPreviewPlace.name}</Text>
                            <Text style={[styles.mapPreviewMeta, isLandscape ? styles.mapPreviewMetaLandscape : null]}>{displayedMapPreviewPlace.venue_type_label}</Text>
                          </View>
                          <View style={styles.mapPreviewActions}>
                            <Pressable onPress={handleClearMapSelection} style={[styles.mapPreviewIconButton, isLandscape ? styles.mapPreviewIconButtonLandscape : null]}>
                              <Text style={[styles.mapPreviewIconText, isLandscape ? styles.mapPreviewIconTextLandscape : null]}>×</Text>
                            </Pressable>
                            <Pressable onPress={() => handleSelectPlace(displayedMapPreviewPlace)} style={[styles.mapPreviewIconButton, isLandscape ? styles.mapPreviewIconButtonLandscape : null]}>
                              <Text style={[styles.mapPreviewIconText, isLandscape ? styles.mapPreviewIconTextLandscape : null]}>↗</Text>
                            </Pressable>
                          </View>
                        </View>

                        <View style={styles.mapPreviewDetails}>
                          <Text style={[styles.mapPreviewDetailText, isLandscape ? styles.mapPreviewDetailTextLandscape : null]}>{displayedMapPreviewPlace.fullAddress}</Text>
                          {displayedMapPreviewPlace.phone_number ? (
                            <Text style={[styles.mapPreviewDetailText, isLandscape ? styles.mapPreviewDetailTextLandscape : null]}>{displayedMapPreviewPlace.phone_number}</Text>
                          ) : null}
                        </View>

                        {displayedMapPreviewImageUrls.length ? (
                          <ScrollView
                            contentContainerStyle={[styles.mapPreviewGallery, isLandscape ? styles.mapPreviewGalleryLandscape : null]}
                            horizontal
                            keyboardDismissMode="on-drag"
                            keyboardShouldPersistTaps="handled"
                            onScrollBeginDrag={Keyboard.dismiss}
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                          >
                            {displayedMapPreviewImageUrls.map((imageUrl) => (
                              <Image
                                key={imageUrl}
                                source={{ uri: imageUrl }}
                                style={[styles.mapPreviewImage, isLandscape ? styles.mapPreviewImageLandscape : null]}
                              />
                            ))}
                          </ScrollView>
                        ) : (
                          <View style={[styles.mapPreviewEmptyState, isLandscape ? styles.mapPreviewEmptyStateLandscape : null]}>
                            <Text style={[styles.mapPreviewEmptyText, isLandscape ? styles.mapPreviewEmptyTextLandscape : null]}>Photos from this business page have not been found yet.</Text>
                          </View>
                        )}
                      </Animated.View>
                    ) : showMapResultsCard ? (
                      <Animated.View style={{ opacity: mapResultsOpacity }}>
                        <Animated.View style={[styles.mapResultsCard, { maxHeight: mapResultsCardAnimatedMaxHeight }] }>
                        <View style={styles.mapResultsHeader}>
                          <View style={styles.mapResultsHeaderCopy}>
                            <Text style={styles.mapResultsTitle}>Best matches</Text>
                            <Text style={styles.mapResultsMeta}>Top {renderedMapSearchResults.length} of {renderedMapResultCount} in view</Text>
                          </View>
                          <View style={styles.mapResultsHeaderActions}>
                            <Pressable
                              accessibilityLabel={mapResultsCollapsed ? 'Expand best matches' : 'Collapse best matches'}
                              onPress={handleToggleMapResultsCollapsed}
                              style={styles.mapResultsCollapseButton}
                            >
                              <View style={styles.mapResultsChevronIcon}>
                                <Animated.View
                                  style={[
                                    styles.mapResultsChevronLine,
                                    styles.mapResultsChevronLineLeft,
                                    {
                                      transform: [
                                        { translateY: mapResultsChevronArmOffset },
                                        { rotate: mapResultsChevronLeftRotate },
                                      ],
                                    },
                                  ]}
                                />
                                <Animated.View
                                  style={[
                                    styles.mapResultsChevronLine,
                                    styles.mapResultsChevronLineRight,
                                    {
                                      transform: [
                                        { translateY: mapResultsChevronArmOffset },
                                        { rotate: mapResultsChevronRightRotate },
                                      ],
                                    },
                                  ]}
                                />
                              </View>
                            </Pressable>
                          </View>
                        </View>
                        <Animated.View
                          pointerEvents={mapResultsCollapsed ? 'none' : 'auto'}
                          style={[
                            styles.mapResultsContent,
                            {
                              maxHeight: mapResultsExpandedProgress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, Math.max(mapResultsCardMaxHeight - 76, 0)],
                              }),
                              opacity: mapResultsContentOpacity,
                              transform: [{ translateY: mapResultsContentTranslateY }],
                            },
                          ]}
                        >
                          {renderedMapSearchResults.length ? (
                            <>
                            <ScrollView
                              contentContainerStyle={styles.mapResultsList}
                              keyboardDismissMode="on-drag"
                              keyboardShouldPersistTaps="handled"
                              nestedScrollEnabled
                              onScrollBeginDrag={Keyboard.dismiss}
                              showsVerticalScrollIndicator
                              style={styles.mapResultsScroll}
                            >
                              {renderedMapSearchResults.map((place) => (
                                <Pressable
                                  key={place.markerKey}
                                  onPress={() => handleFocusMapResult(place)}
                                  style={styles.mapResultRow}
                                >
                                  <View style={styles.mapResultCopy}>
                                    <Text numberOfLines={1} style={styles.mapResultTitle}>{place.name}</Text>
                                    <Text numberOfLines={2} style={styles.mapResultMeta}>
                                      {place.venue_type_label} • {place.fullAddress}
                                    </Text>
                                  </View>
                                  <Text style={styles.mapResultAction}>Focus</Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                            {renderedMapSearchResults.length < renderedMapResultCount ? (
                              <Pressable disabled={loadingMoreMapResults} onPress={handleShowMoreMapResults} style={styles.mapResultsMoreButton}>
                                {loadingMoreMapResults ? (
                                  <View style={styles.mapResultsMoreButtonLoadingContent}>
                                    <ActivityIndicator color="#1f5f5b" size="small" />
                                    <Text style={styles.mapResultsMoreButtonText}>Loading...</Text>
                                  </View>
                                ) : (
                                  <Text style={styles.mapResultsMoreButtonText}>
                                    Show next {Math.min(nextMapResultsIncrement, renderedMapResultCount - renderedMapSearchResults.length)}
                                  </Text>
                                )}
                              </Pressable>
                            ) : null}
                          </>
                        ) : (
                          <Text style={styles.mapResultEmptyText}>No map matches found for that search yet.</Text>
                        )}
                        </Animated.View>
                        </Animated.View>
                      </Animated.View>
                    ) : null}

                    {errorMessage ? (
                      <View style={[styles.errorBanner, styles.mapErrorBanner]}>
                        <Text style={styles.errorText}>{errorMessage}</Text>
                      </View>
                    ) : null}
                  </Animated.View>

                  <Animated.View pointerEvents={browseMode === 'list' ? 'auto' : 'none'} style={[styles.browseContentFill, styles.browseModeContentLayer, listModeTransitionStyle]}>
                    {listLoading ? (
                      <View style={styles.centerState}>
                        <ActivityIndicator color="#c65d1f" size="large" />
                        <Text style={styles.centerStateText}>Loading places...</Text>
                      </View>
                    ) : (
                      <FlatList
                        columnWrapperStyle={browseListColumns > 1 ? styles.placeCardColumn : undefined}
                        contentContainerStyle={[styles.listContent, browseListColumns > 1 ? styles.listContentLandscape : null]}
                        data={displayedBrowsePlaces}
                        keyExtractor={(item) => item.listKey}
                        key={browseListColumns}
                        initialNumToRender={6}
                        numColumns={browseListColumns}
                        renderItem={({ item, index }) => (
                          <AnimatedListPlaceCard
                            browseListColumns={browseListColumns}
                            item={item}
                            listRevealEnabled={listRevealEnabled}
                            revealIndex={index}
                            revealToken={listRevealToken}
                            onPress={() => handleSelectPlace(item)}
                          />
                        )}
                        ListEmptyComponent={displayedBrowsePlaces.length === 0 ? <Text style={styles.emptyStateText}>{getBrowseEmptyStateMessage(normalizedSearchQuery)}</Text> : null}
                        showsVerticalScrollIndicator={false}
                      />
                    )}

                    {errorMessage ? (
                      <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>{errorMessage}</Text>
                      </View>
                    ) : null}
                  </Animated.View>
                </View>

                {authenticatedSession && browseMode === 'map' ? (
                  <Pressable
                    onPress={handleOpenProfiles}
                    style={[
                      styles.floatingDashboardButton,
                      styles.floatingDashboardButtonMap,
                      { bottom: floatingDashboardButtonOffset, right: 18 },
                    ]}
                  >
                    <Text style={styles.floatingDashboardButtonText}>Back to Dashboard</Text>
                  </Pressable>
                ) : guestMapOnlyMode && browseMode === 'map' ? (
                  <Pressable
                    accessibilityLabel="Exit guest map"
                    onPress={handleExitGuestMap}
                    style={[
                      styles.floatingDashboardButton,
                      styles.floatingDashboardButtonMap,
                      styles.floatingGuestExitButton,
                      { bottom: floatingDashboardButtonOffset, right: 18 },
                    ]}
                  >
                    <View style={{ alignItems: 'center', flexDirection: 'row', height: 28, justifyContent: 'center', width: 28 }}>
                      <View style={{ backgroundColor: '#17110c', borderRadius: 2, height: 22, transform: [{ skewY: '-12deg' }], width: 8 }} />
                      <View style={{ height: 24, marginLeft: 3, position: 'relative', width: 8 }}>
                        <View style={{ backgroundColor: '#17110c', height: 3, position: 'absolute', right: 0, top: 0, width: 8 }} />
                        <View style={{ backgroundColor: '#17110c', height: 18, position: 'absolute', right: 0, top: 3, width: 3 }} />
                        <View style={{ backgroundColor: '#17110c', bottom: 0, height: 3, position: 'absolute', right: 0, width: 8 }} />
                      </View>
                      <View style={{ alignItems: 'center', flexDirection: 'row', marginLeft: 2 }}>
                        <View style={{ backgroundColor: '#17110c', height: 4, width: 7 }} />
                        <View style={{ borderBottomColor: 'transparent', borderBottomWidth: 5, borderLeftColor: '#17110c', borderLeftWidth: 8, borderTopColor: 'transparent', borderTopWidth: 5 }} />
                      </View>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            </SafeAreaView>
          </View>
        </Animated.View>
        {shouldShowProfileOverlay ? (
          <Animated.View style={[styles.screenTransitionLayerAbsolute, browseProfileIncomingStyle]}>
            {renderProfilesScreen()}
          </Animated.View>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <StatusBar backgroundColor="transparent" style="dark" translucent={translucentStatusBar} />
      {!startupImagesReady ? (
        <View pointerEvents="none" style={styles.startupImagePreloadLayer}>
          {startupImageSources.map((source, index) => (
            <Image
              key={index}
              fadeDuration={0}
              onError={handleStartupImageLoaded}
              onLoadEnd={handleStartupImageLoaded}
              source={source}
              style={styles.startupImagePreload}
            />
          ))}
        </View>
      ) : null}
      {showLoginSuccessTransition ? (
        <View style={styles.onboardingTransitionRoot}>
          <View style={styles.screenTransitionLayer}>
            {renderOnboardingScreen('profiles')}
          </View>
          <Animated.View pointerEvents="none" style={[styles.screenTransitionLayerAbsolute, loginSuccessOutgoingStyle]}>
            {renderOnboardingScreen('auth')}
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.screenTransitionLayerAbsolute, styles.incomingOnboardingOverlay, loginSuccessIncomingStyle]}>
            {renderOnboardingScreen('profiles')}
          </Animated.View>
        </View>
      ) : showLogoutTransition ? (
        <View style={styles.onboardingTransitionRoot}>
          <View style={styles.screenTransitionLayer}>
            {renderOnboardingScreen('auth')}
          </View>
          <Animated.View pointerEvents="none" style={[styles.screenTransitionLayerAbsolute, logoutOutgoingStyle]}>
            {renderOnboardingScreen('profiles', logoutTransitionSession)}
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.screenTransitionLayerAbsolute, styles.incomingOnboardingOverlay, logoutIncomingStyle]}>
            {renderOnboardingScreen('auth')}
          </Animated.View>
        </View>
      ) : authenticatedSession && !selectedPlaceSlug && !usesProfileStackSlideTransition && (['profiles', 'settings', 'support', 'privacy-policy', 'terms-of-service', 'browse'].includes(screenMode) || usesBrowseProfileSlideTransition) ? (
        renderAuthenticatedMainShell()
      ) : !authenticatedSession && !selectedPlaceSlug && (screenMode === 'browse' || usesGuestBrowseSlideTransition || (screenMode === 'splash' && !incomingOnboardingScreen)) ? (
        renderGuestMainShell()
      ) : selectedPlaceSlug ? (
        <View style={styles.fullScreenRoot}>
        <Animated.View style={[styles.screenTransitionLayerAbsolute, screenTransitionStyle]}>
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <PlaceDetailScreen
          backButtonLabel={screenMode === 'profiles' ? 'Back to Profile' : 'Back to Places'}
          detailLoading={detailLoading}
          errorMessage={errorMessage}
          favoriteHelperText={favoriteHelperText}
          favoriteSubmitting={favoriteSubmitting}
          isLandscape={isLandscape}
          isFavorited={selectedPlaceIsFavorited}
          onBack={handleBackToBrowse}
          onSelectLocation={setSelectedLocationId}
          onToggleFavorite={() => void handleToggleFavoriteBusiness()}
          showFavoriteControl={showFavoriteControl}
          selectedPlace={selectedPlace}
          selectedPlaceDeals={selectedPlaceDeals}
          selectedPlaceLocation={selectedPlaceLocation}
          selectedPlaceOperatingHours={selectedPlaceOperatingHours}
        />
        </SafeAreaView>
        </Animated.View>
        </View>
      ) : usesOnboardingSlideTransition && currentOnboardingScreen ? (
        <View style={styles.onboardingTransitionRoot}>
          <Animated.View
            pointerEvents={incomingOnboardingScreen ? 'none' : 'auto'}
            style={[
              incomingOnboardingScreen ? styles.screenTransitionLayerAbsolute : styles.screenTransitionLayer,
              currentOnboardingScreen === 'profiles' && !incomingOnboardingScreen ? profileSceneTransitionStyle : null,
              authIntroStyle,
              currentOnboardingTransitionStyle,
            ]}
          >
            {renderOnboardingScreen(currentOnboardingScreen)}
          </Animated.View>
          {incomingOnboardingScreen ? (
            <Animated.View style={[styles.screenTransitionLayerAbsolute, styles.incomingOnboardingOverlay, incomingScreenTransitionStyle]}>
              {renderOnboardingScreen(incomingOnboardingScreen)}
            </Animated.View>
          ) : null}
        </View>
      ) : (
        renderBrowseScreen()
      )}
      <Modal
        animationType="fade"
        onRequestClose={handleDismissGuestFavoritePrompt}
        transparent
        visible={showGuestFavoritePrompt}
      >
        <View style={styles.guestFavoriteModalBackdrop}>
          <View style={styles.guestFavoriteModalCard}>
            <Text style={styles.guestFavoriteModalTitle}>Create a free customer account to save favorites</Text>
            <Text style={styles.guestFavoriteModalText}>
              If you want to keep tabs on your favorite businesses and receive notifications later, create a free customer account first.
            </Text>
            <View style={styles.guestFavoriteModalActions}>
              <Pressable onPress={handleDismissGuestFavoritePrompt} style={styles.guestFavoriteModalSecondaryButton}>
                <Text style={styles.guestFavoriteModalSecondaryText}>Maybe later</Text>
              </Pressable>
              <Pressable onPress={handleCreateCustomerAccountFromGuestFavorite} style={styles.guestFavoriteModalPrimaryButton}>
                <Text style={styles.guestFavoriteModalPrimaryText}>Create free customer account</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function AnimatedListPlaceCard({
  browseListColumns,
  item,
  listRevealEnabled,
  onPress,
  revealIndex,
  revealToken,
}: {
  browseListColumns: number;
  item: BrowsePlace;
  listRevealEnabled: boolean;
  onPress: () => void;
  revealIndex: number;
  revealToken: number;
}) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.stopAnimation();

    if (!listRevealEnabled) {
      entrance.setValue(0);
      return;
    }

    entrance.setValue(0);
    Animated.timing(entrance, {
      delay: Math.min(revealIndex * 55, 700),
      duration: 180,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [entrance, item.id, listRevealEnabled, revealIndex, revealToken]);

  return (
    <Animated.View
      style={[
        {
          opacity: entrance,
          transform: [{
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          }],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={[styles.placeCard, browseListColumns > 1 ? styles.placeCardLandscape : null]}
      >
        <Text style={styles.placeCity}>{getPlaceCardEyebrow(item)}</Text>
        <Text style={styles.placeTitle}>{item.name}</Text>
        <Text style={styles.placeMeta}>{item.venue_type_label}</Text>
        <Text style={styles.placeAddress}>{getPlaceCardAddress(item)}</Text>
      </Pressable>
    </Animated.View>
  );
}

function getAnimatedMapMarkerStyle(
  place: MappedPlace,
  region: Region,
  width: number,
  height: number,
  transition: Animated.Value,
) {
  const maxDistanceFromCenter = Math.max(Math.hypot(width / 2, height / 2), 1);
  const normalizedDistanceFromCenter = clamp(
    getMarkerCenterScreenDistance(place, region, width, height) / maxDistanceFromCenter,
    0,
    1,
  );
  const revealStart = normalizedDistanceFromCenter * 0.58;
  const revealEnd = Math.min(revealStart + 0.22, 1);

  return {
    opacity: transition.interpolate({
      inputRange: [0, revealStart, revealEnd, 1],
      outputRange: [0, 0, 1, 1],
      extrapolate: 'clamp',
    }),
    transform: [],
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while talking to the backend.';
}

function getSelectedPlaceLocation(
  place: PlaceDetail | null,
  preferredLocationId: number | null,
  selectedCity: CityFilterValue,
): PlaceDetail | PlaceLocationDetail | null {
  if (!place) {
    return null;
  }

  const locations = place.locations.length ? place.locations : [place];

  if (!locations.length) {
    return null;
  }

  if (preferredLocationId !== null) {
    const preferredLocation = locations.find((location) => location.id === preferredLocationId);
    if (preferredLocation) {
      return preferredLocation;
    }
  }

  if (selectedCity !== 'all') {
    const matchingCityLocation = locations.find((location) => location.city === selectedCity);
    if (matchingCityLocation) {
      return matchingCityLocation;
    }
  }

  return locations[0] ?? null;
}

function getBrowseMapRegion(selectedCity: CityFilterValue, mappedPlaces: MappedPlace[]) {
  if (selectedCity !== 'all') {
    return clampRegionToBounds(cityMapRegions[selectedCity]);
  }

  return getMapRegion(mappedPlaces);
}

function toggleWeekdaySelection(current: WeekdayFilterValue[], day: WeekdayFilterValue) {
  const next = current.includes(day)
    ? current.filter((value) => value !== day)
    : [...current, day];
  const weekdayOrder = weekdayFilters.map((filter) => filter.value);

  return next.sort((first, second) => weekdayOrder.indexOf(first) - weekdayOrder.indexOf(second));
}

function getFilteredPlaces(
  places: PlaceListItem[],
  filters: {
    confirmedDealsOnly: boolean;
    searchQuery: string;
    selectedCity: CityFilterValue;
    selectedDealDays: WeekdayFilterValue[];
    selectedOperatingDays: WeekdayFilterValue[];
    selectedVenueTypes: VenueFilterValue[];
    verifiedBusinessesOnly: boolean;
  },
) {
  return places
    .map((place, index) => ({
      index,
      place,
      score: getPlaceSearchScore(place, filters.searchQuery),
    }))
    .filter(({ place, score }) => {
      const placeCities = new Set(getPlaceLocations(place).map((location) => location.city));
      const matchesCity = filters.selectedCity === 'all' || placeCities.has(filters.selectedCity);
      const matchesVenueType = filters.selectedVenueTypes.includes(place.venue_type as VenueFilterValue);
      const matchesSearch = filters.searchQuery.length === 0 || score > 0;
      const matchesDeals = !filters.confirmedDealsOnly || place.has_deals || place.deal_count > 0;
      const matchesOperatingDays = !filters.selectedOperatingDays.length || hasAnyMatchingWeekday(place.operating_weekdays, filters.selectedOperatingDays);
      const matchesDealDays = !filters.selectedDealDays.length || hasAnyMatchingWeekday(place.deal_weekdays, filters.selectedDealDays);
      const matchesVerified = !filters.verifiedBusinessesOnly || place.is_verified;

      return matchesCity && matchesVenueType && matchesSearch && matchesDeals && matchesOperatingDays && matchesDealDays && matchesVerified;
    })
    .sort((first, second) => {
      if (filters.searchQuery.length === 0) {
        return first.index - second.index;
      }

      return second.score - first.score || first.place.name.localeCompare(second.place.name);
    })
    .map(({ place }) => place);
}

function getMappedPlacesForBrowse(filteredPlaces: PlaceListItem[]): MappedPlace[] {
  return filteredPlaces.flatMap((place) => (
    getPlaceLocations(place).flatMap((location) => {
      if (location.latitude === null || location.longitude === null) {
        return [];
      }

      return [
        {
          ...place,
          city: location.city,
          city_label: location.city_label,
          address_line_1: location.address_line_1,
          address_line_2: location.address_line_2,
          neighborhood: location.neighborhood,
          state: location.state,
          postal_code: location.postal_code,
          latitude: location.latitude,
          longitude: location.longitude,
          phone_number: location.phone_number,
          website_url: location.website_url,
          image_urls: location.image_urls,
          fullAddress: formatPlaceAddress(location),
          locationId: location.id,
          markerLatitude: location.latitude,
          markerLongitude: location.longitude,
          markerKey: `${place.slug}:${location.id}`,
        },
      ];
    })
  ));
}

function getBrowsePlacesForDisplay(filteredPlaces: PlaceListItem[]): BrowsePlace[] {
  return filteredPlaces.flatMap((place) => (
    getPlaceLocations(place).map((location) => ({
      ...place,
      city: location.city,
      city_label: location.city_label,
      address_line_1: location.address_line_1,
      address_line_2: location.address_line_2,
      neighborhood: location.neighborhood,
      state: location.state,
      postal_code: location.postal_code,
      latitude: location.latitude,
      longitude: location.longitude,
      phone_number: location.phone_number,
      website_url: location.website_url,
      image_urls: location.image_urls,
      fullAddress: formatPlaceAddress(location),
      locationId: location.id,
      listKey: `${place.slug}:${location.id}`,
      locations: [location],
    }))
  ));
}

function hasAnyMatchingWeekday(placeWeekdays: number[], selectedWeekdays: WeekdayFilterValue[]) {
  return selectedWeekdays.some((weekday) => placeWeekdays.includes(weekday));
}

function getMapResultsIncrement(totalResults: number) {
  if (totalResults >= 300) {
    return 30;
  }

  if (totalResults >= 200) {
    return 20;
  }

  if (totalResults >= 100) {
    return 10;
  }

  return 5;
}

function getPlaceSearchScore(place: PlaceListItem, searchQuery: string) {
  if (!searchQuery.length) {
    return 1;
  }

  const searchableFields = getPlaceSearchFields(place);
  const tokens = searchQuery.split(' ').filter(Boolean);
  let totalScore = 0;

  for (const token of tokens) {
    let bestTokenScore = 0;

    searchableFields.forEach(({ value, weight }) => {
      const tokenScore = getTokenMatchScore(value, token) * weight;
      if (tokenScore > bestTokenScore) {
        bestTokenScore = tokenScore;
      }
    });

    if (!bestTokenScore) {
      return 0;
    }

    totalScore += bestTokenScore;
  }

  if (searchableFields.some(({ value }) => value.includes(searchQuery))) {
    totalScore += 30;
  }

  return totalScore;
}

function getPlaceSearchFields(place: PlaceListItem) {
  return [
    { value: normalizeSearchText(place.name), weight: 12 },
    { value: normalizeSearchText(place.venue_type_label), weight: 5 },
    ...getPlaceLocations(place).flatMap((location) => [
      { value: normalizeSearchText(location.city_label), weight: 6 },
      { value: normalizeSearchText(location.neighborhood), weight: 7 },
      { value: normalizeSearchText(location.address_line_1), weight: 8 },
      { value: normalizeSearchText(location.address_line_2), weight: 3 },
      { value: normalizeSearchText(formatPlaceAddress(location)), weight: 9 },
      { value: normalizeSearchText(location.postal_code), weight: 2 },
    ]),
  ];
}

function getTokenMatchScore(fieldValue: string, token: string) {
  if (!fieldValue.length || !token.length) {
    return 0;
  }

  if (fieldValue === token) {
    return 18;
  }

  if (fieldValue.startsWith(token)) {
    return 14;
  }

  if (fieldValue.split(' ').some((word) => word.startsWith(token))) {
    return 10;
  }

  if (fieldValue.includes(token)) {
    return 6;
  }

  return 0;
}

function getMapRegion(mappedPlaces: MappedPlace[]) {
  if (!mappedPlaces.length) {
    return clampRegionToBounds(defaultMapRegion);
  }

  const latitudes = mappedPlaces.map((place) => place.latitude);
  const longitudes = mappedPlaces.map((place) => place.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return clampRegionToBounds({
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * mapFitPaddingFactor, minLatitudeDelta),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * mapFitPaddingFactor, minLongitudeDelta),
  });
}

function normalizeRegion(region: Region): Region {
  const latitudeDelta = clamp(region.latitudeDelta, minLatitudeDelta, maxLatitudeDelta);
  const longitudeDelta = clamp(region.longitudeDelta, minLongitudeDelta, maxLongitudeDelta);

  return {
    latitude: region.latitude,
    longitude: region.longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

function getMarkerCenterScreenDistance(place: MappedPlace, region: Region, width: number, height: number) {
  return Math.hypot(
    getMarkerOffsetFromCenterX(place, region, width),
    getMarkerOffsetFromCenterY(place, region, height),
  );
}

function getMarkerOffsetFromCenterX(place: MappedPlace, region: Region, width: number) {
  if (!region.longitudeDelta) {
    return 0;
  }

  return ((place.markerLongitude - region.longitude) / region.longitudeDelta) * width;
}

function getMarkerOffsetFromCenterY(place: MappedPlace, region: Region, height: number) {
  if (!region.latitudeDelta) {
    return 0;
  }

  return ((region.latitude - place.markerLatitude) / region.latitudeDelta) * height;
}

function clampRegionToBounds(region: Region): Region {
  const normalizedRegion = normalizeRegion(region);
  const latitudePadding = normalizedRegion.latitudeDelta / 2;
  const longitudePadding = normalizedRegion.longitudeDelta / 2;
  const minLatitude = mapAreaBounds.minLatitude + latitudePadding;
  const maxLatitude = mapAreaBounds.maxLatitude - latitudePadding;
  const minLongitude = mapAreaBounds.minLongitude + longitudePadding;
  const maxLongitude = mapAreaBounds.maxLongitude - longitudePadding;

  return {
    latitude: clamp(normalizedRegion.latitude, minLatitude, maxLatitude),
    longitude: clamp(normalizedRegion.longitude, minLongitude, maxLongitude),
    latitudeDelta: normalizedRegion.latitudeDelta,
    longitudeDelta: normalizedRegion.longitudeDelta,
  };
}

function shouldSnapRegionToBounds(region: Region) {
  const normalizedRegion = normalizeRegion(region);
  const latitudePadding = normalizedRegion.latitudeDelta / 2;
  const longitudePadding = normalizedRegion.longitudeDelta / 2;
  const minLatitude = mapAreaBounds.minLatitude + latitudePadding;
  const maxLatitude = mapAreaBounds.maxLatitude - latitudePadding;
  const minLongitude = mapAreaBounds.minLongitude + longitudePadding;
  const maxLongitude = mapAreaBounds.maxLongitude - longitudePadding;
  const snapTolerance = 0.0005;

  return (
    normalizedRegion.latitude < minLatitude - snapTolerance ||
    normalizedRegion.latitude > maxLatitude + snapTolerance ||
    normalizedRegion.longitude < minLongitude - snapTolerance ||
    normalizedRegion.longitude > maxLongitude + snapTolerance
  );
}

function areRegionsEqual(first: Region, second: Region) {
  return (
    nearlyEqual(first.latitude, second.latitude) &&
    nearlyEqual(first.longitude, second.longitude) &&
    nearlyEqual(first.latitudeDelta, second.latitudeDelta) &&
    nearlyEqual(first.longitudeDelta, second.longitudeDelta)
  );
}

function isStationaryMapGesture(previousRegion: Region, nextRegion: Region) {
  const centerTolerance = 0.0005;
  const deltaTolerance = 0.0001;

  const centerStayedPut =
    Math.abs(previousRegion.latitude - nextRegion.latitude) < centerTolerance &&
    Math.abs(previousRegion.longitude - nextRegion.longitude) < centerTolerance;

  const deltaChanged =
    Math.abs(previousRegion.latitudeDelta - nextRegion.latitudeDelta) > deltaTolerance ||
    Math.abs(previousRegion.longitudeDelta - nextRegion.longitudeDelta) > deltaTolerance;

  return centerStayedPut && deltaChanged;
}

function isWideMapRegion(region: Region) {
  return (
    region.latitudeDelta >= maxLatitudeDelta * 0.75 ||
    region.longitudeDelta >= maxLongitudeDelta * 0.75
  );
}

function nearlyEqual(first: number, second: number) {
  return Math.abs(first - second) < 0.0001;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
