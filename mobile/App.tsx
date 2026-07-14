import { memo, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import {
  ActivityIndicator,
  Animated,
  AppState,
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
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, type Region } from 'react-native-maps';

import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  deleteBusinessDirectMessageThread,
  createBusinessProfile,
  createCustomerProfile,
  createInformalBusinessProfile,
  createManualBusinessProfile,
  blockBusinessDirectMessagesForCustomer,
  clearFavoriteBusinessNotification,
  clearFavoriteBusinessNotifications,
  fetchDirectMessageThreadDetail,
  fetchDirectMessageThreads,
  deleteProfileAccount,
  disableTwoFactor,
  fetchProfileDashboard,
  fetchPlaceDetail,
  fetchPlaces,
  getDefaultApiBaseUrl,
  loginProfile,
  registerPushDevice,
  sendDirectMessage,
  sendDirectMessageImage,
  requestPasswordReset,
  requestUsernameReminder,
  resendVerificationCode,
  resendVerificationEmail,
  submitSupportRequest,
  toggleFavoriteBusiness,
  unblockBusinessDirectMessagesForCustomer,
  updateProfileDashboard,
  updateProfileDashboardWithUploads,
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
import { AccountSettingsScreen, BlockedDirectMessageCustomersScreen, BusinessProfileEditorScreen, DashboardScreen, FavoriteBusinessNotificationsScreen, FavoriteBusinessesScreen } from './src/screens/DashboardScreen';
import { BrowseControls } from './src/screens/BrowseControls';
import { NativeIOSLiquidGlassBottomNav, NativeIOSLiquidGlassHeaderButton, isNativeIOSLiquidGlassBottomNavAvailable } from './src/components/NativeIOSLiquidGlass';
import { PhotoLightbox } from './src/components/PhotoLightbox';
import { DirectMessagesScreen } from './src/screens/DirectMessagesScreen';
import { HomeFeedScreen } from './src/screens/HomeFeedScreen';
import { PlaceDetailScreen } from './src/screens/PlaceDetailScreen';
import { SplashScreen } from './src/screens/SplashScreen';
import { shouldSkipBrowseMapAutoFit } from './src/mapBrowseState';
import { buildSocialProfilesFromInputs, socialProfilesToInputs } from './src/socialProfiles';
import { buildDealOverridesFromDeals, buildNormalizedDealOverrides, buildNormalizedOperatingHourOverrides, buildOperatingHourOverridesFromWindows } from './src/businessProfileOverrides';
import { extractFavoriteBusinessSlugFromNotificationData, registerForPushNotificationsAsync } from './src/pushNotifications';
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
  getPlaceCardImageUrl,
  getPlaceCardAddress,
  getPlaceCardEyebrow,
  getPlaceLocations,
  getSelectedClaimLocation,
  normalizeSearchText,
} from './src/placeHelpers';
import { getSeededPlaceDetail, getSeededPlaces, seededPlacesAvailable } from './src/seededPlaces';
import type {
  BusinessAttachmentBuckets,
  BusinessAttachmentDraft,
  BusinessAttachmentKind,
  BusinessVerificationDocuments,
  BusinessDealOverride,
  BusinessSignupRequest,
  CustomerSignupRequest,
  Deal,
  EmailVerificationChallengeResponse,
  HappyHourWindow,
  InformalBusinessSignupRequest,
  LoginRequest,
  ManualBusinessSignupRequest,
  OperatingHourWindow,
  BusinessOperatingHourOverride,
  PlaceDetail,
  PlaceListItem,
  PlaceLocation,
  PlaceLocationDetail,
  ProfileDashboardUpdateRequest,
  SignupResponse,
  TwoFactorSetupResponse,
  DirectMessageSendResponse,
  DirectMessageThread,
  DirectMessageThreadDetailResponse,
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
const shellFadeDurationMs = 360;
const seedDataFallbackMessage = 'Live backend unavailable. Showing bundled test data.';
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
type AppScreenMode = 'splash' | 'auth' | 'browse' | 'home-feed' | 'profiles' | 'favorite-businesses' | 'business-notifications' | 'business-profile-editor' | 'settings' | 'blocked-direct-message-customers' | 'support' | 'privacy-policy' | 'terms-of-service' | 'business-search' | 'business-claim' | 'manual-business-claim' | 'informal-business-claim' | 'email-verification' | 'business-claim-review-pending' | 'direct-messages';
type OnboardingTransitionDirection = 'forward' | 'backward';
type TransitionAxis = 'x' | 'y';
type ClaimReturnDestination = 'business-search' | 'browse-map' | 'profiles';
type MainShellScreen = 'browse' | 'home-feed' | 'profiles' | 'business-profile-editor' | 'settings' | 'blocked-direct-message-customers' | 'support' | 'privacy-policy' | 'terms-of-service';
type MainShellBottomNavItem = 'home' | 'map' | 'profile' | 'more';
type ShellFadeScope = 'browse' | 'profile';
type SettingsSubmittingAction = 'two-factor-begin' | 'two-factor-confirm' | 'two-factor-disable' | 'business-location' | 'direct-messaging' | 'direct-message-block' | 'delete-account' | null;
type CustomerBusinessClaimNotice = {
  businessName: string;
  locationLabel: string;
};

type UserCoordinates = {
  latitude: number;
  longitude: number;
};

type MapPreviewPlace = PlaceListItem & {
  fullAddress: string;
  locationId: number;
};

type MapSearchResultPlace = MapPreviewPlace & {
  markerKey: string | null;
  resultKey: string;
};

type MappedPlace = MapPreviewPlace & {
  latitude: number;
  longitude: number;
  markerLatitude: number;
  markerLongitude: number;
  markerKey: string;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type BrowsePlace = MapPreviewPlace & {
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
  instagram_profile: '',
  facebook_profile: '',
  tiktok_profile: '',
  youtube_profile: '',
  contact_name: '',
  job_title: '',
  work_email: '',
  work_phone: '',
  employer_address: '',
  address_not_applicable: false,
  social_media_links_text: '',
  deal_overrides: [],
  operating_hour_overrides: [],
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

function buildClaimPrefill(detail: PlaceDetail, locationId: number | null) {
  const selectedLocation = detail.locations.find((location) => location.id === locationId) ?? detail.locations[0] ?? detail;
  const operatingHours = selectedLocation.operating_hours.length ? selectedLocation.operating_hours : detail.operating_hours;
  const deals = selectedLocation.deals.length ? selectedLocation.deals : detail.deals;
  const imageReferences = dedupeImageUrls([...selectedLocation.image_urls, ...detail.image_urls]);
  const socialInputs = socialProfilesToInputs(detail.social_profiles, selectedLocation.website_url || detail.website_url);

  return {
    locationId: selectedLocation.id,
    business_city: selectedLocation.city,
    business_venue_type: selectedLocation.venue_type,
    business_website_url: selectedLocation.website_url || detail.website_url,
    instagram_profile: socialInputs.instagram,
    facebook_profile: socialInputs.facebook,
    tiktok_profile: socialInputs.tiktok,
    youtube_profile: socialInputs.youtube,
    deal_overrides: buildDealOverridesFromDeals(deals),
    operating_hour_overrides: buildOperatingHourOverridesFromWindows(operatingHours),
    offer_entries_text: '',
    hours_of_operation_entries_text: '',
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
  const socialProfiles = buildSocialProfilesFromInputs({
    instagram: form.instagram_profile,
    facebook: form.facebook_profile,
    tiktok: form.tiktok_profile,
    youtube: form.youtube_profile,
    website: form.business_website_url,
  });

  return {
    business_website_url: form.business_website_url.trim(),
    social_profiles: socialProfiles,
    deal_overrides: buildNormalizedDealOverrides(form.deal_overrides),
    operating_hour_overrides: buildNormalizedOperatingHourOverrides(form.operating_hour_overrides),
    social_media_links: Object.entries(socialProfiles)
      .filter(([platform]) => platform !== 'website')
      .map(([, profile]) => profile?.url ?? '')
      .filter(Boolean),
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

function normalizeBusinessPhotoUpload(asset: ImagePicker.ImagePickerAsset): BusinessAttachmentDraft {
  return {
    id: `${asset.assetId ?? asset.uri}::${asset.fileName ?? 'business-photo'}::${asset.fileSize ?? 0}`,
    name: asset.fileName ?? `business-photo-${Date.now()}.jpg`,
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    size: asset.fileSize ?? null,
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
    instagram_profile: '',
    facebook_profile: '',
    tiktok_profile: '',
    youtube_profile: '',
    contact_name: '',
    job_title: '',
    work_email: '',
    work_phone: '',
    employer_address: '',
    address_not_applicable: false,
    social_media_links_text: '',
    deal_overrides: [],
    operating_hour_overrides: [],
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
  const bottomMoreSheetProgress = useRef(new Animated.Value(0)).current;
  const bottomMoreSheetDragY = useRef(new Animated.Value(0)).current;
  const bottomMoreSheetClosingRef = useRef(false);
  const selectedPlaceReturnFade = useRef(new Animated.Value(1)).current;
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
  const [mapSearchPanelLifted, setMapSearchPanelLifted] = useState(false);
  const [darkMapMode, setDarkMapMode] = useState(false);
  const [displayedDarkMapMode, setDisplayedDarkMapMode] = useState(false);
  const [transitioningMapTheme, setTransitioningMapTheme] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<(typeof cityFilters)[number]['value']>('all');
  const [selectedVenueTypes, setSelectedVenueTypes] = useState<VenueFilterValue[]>(() => venueFilters.map((filter) => filter.value));
  const [confirmedDealsOnly, setConfirmedDealsOnly] = useState(false);
  const [selectedOperatingDays, setSelectedOperatingDays] = useState<WeekdayFilterValue[]>([]);
  const [selectedDealDays, setSelectedDealDays] = useState<WeekdayFilterValue[]>([]);
  const [informalBusinessesOnly, setInformalBusinessesOnly] = useState(false);
  const [verifiedBusinessesOnly, setVerifiedBusinessesOnly] = useState(false);
  const [places, setPlaces] = useState<PlaceListItem[]>([]);
  const [selectedPlaceSlug, setSelectedPlaceSlug] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetail | null>(null);
  const [selectedMapPlaceKey, setSelectedMapPlaceKey] = useState<string | null>(null);
  const [selectedMapSearchPreviewPlace, setSelectedMapSearchPreviewPlace] = useState<MapPreviewPlace | null>(null);
  const [displayedMapPreviewPlace, setDisplayedMapPreviewPlace] = useState<MapPreviewPlace | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [favoriteSubmitting, setFavoriteSubmitting] = useState(false);
  const [guestBrowseModeLocked, setGuestBrowseModeLocked] = useState(false);
  const [showGuestFavoritePrompt, setShowGuestFavoritePrompt] = useState(false);
  const [showGuestBusinessClaimPrompt, setShowGuestBusinessClaimPrompt] = useState(false);
  const [showGuestAccuracyPrompt, setShowGuestAccuracyPrompt] = useState(false);
  const [showGuestBottomNavPrompt, setShowGuestBottomNavPrompt] = useState(false);
  const [showCustomerBusinessClaimPrompt, setShowCustomerBusinessClaimPrompt] = useState(false);
  const [customerBusinessClaimNotice, setCustomerBusinessClaimNotice] = useState<CustomerBusinessClaimNotice | null>(null);
  const [claimReturnDestination, setClaimReturnDestination] = useState<ClaimReturnDestination>('business-search');
  const [mapRegion, setMapRegion] = useState<Region>(() => initialMapRegionRef.current);
  const mapRegionRef = useRef(mapRegion);
  const [reloadCount, setReloadCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showMapResultsCard, setShowMapResultsCard] = useState(false);
  const [mapResultsCollapsed, setMapResultsCollapsed] = useState(false);
  const [renderedMapSearchResults, setRenderedMapSearchResults] = useState<MapSearchResultPlace[]>([]);
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
  const mapResultsCardTransitionVersionRef = useRef(0);
  const pendingImmediateMapPinsRefreshRef = useRef(false);
  const pendingListRevealRef = useRef(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(initialProfileFormState);
  const [businessAttachments, setBusinessAttachments] = useState<BusinessAttachmentBuckets>(initialBusinessAttachments);
  const [businessPhotoUploads, setBusinessPhotoUploads] = useState<BusinessAttachmentDraft[]>([]);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null);
  const [supportDraftContext, setSupportDraftContext] = useState<{ message: string; subject: string } | null>(null);
  const [pendingEmailVerification, setPendingEmailVerification] = useState<EmailVerificationChallengeResponse | null>(null);
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardSubmitting, setDashboardSubmitting] = useState(false);
  const [settingsSubmittingAction, setSettingsSubmittingAction] = useState<SettingsSubmittingAction>(null);
  const [pendingBusinessLocationTrackingEnabled, setPendingBusinessLocationTrackingEnabled] = useState<boolean | null>(null);
  const [pendingDirectMessagingEnabled, setPendingDirectMessagingEnabled] = useState<boolean | null>(null);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [bottomMoreSheetVisible, setBottomMoreSheetVisible] = useState(false);
  const [shellFadeScope, setShellFadeScope] = useState<ShellFadeScope | null>(null);
  const [selectedPlaceReturnFadeActive, setSelectedPlaceReturnFadeActive] = useState(false);
  const [profilePlaces, setProfilePlaces] = useState<PlaceListItem[]>([]);
  const [profilePlacesLoading, setProfilePlacesLoading] = useState(false);
  const allPlacesCacheRef = useRef<{ apiBaseUrl: string; places: PlaceListItem[]; reloadCount: number } | null>(null);
  const [businessSearchQuery, setBusinessSearchQuery] = useState('');
  const [selectedClaimPlace, setSelectedClaimPlace] = useState<PlaceListItem | null>(null);
  const [selectedClaimLocationId, setSelectedClaimLocationId] = useState<number | null>(null);
  const [logoutTransitionSession, setLogoutTransitionSession] = useState<SignupResponse | null>(null);
  const [incomingOnboardingScreen, setIncomingOnboardingScreen] = useState<AppScreenMode | null>(null);
  const [returningToSplashScreen, setReturningToSplashScreen] = useState<AppScreenMode | null>(null);
  const [browseProfileTransitionFrom, setBrowseProfileTransitionFrom] = useState<'profiles' | 'browse' | null>(null);
  const [incomingBrowseProfileScreen, setIncomingBrowseProfileScreen] = useState<'profiles' | 'browse' | null>(null);
  const [incomingBrowseProfileTargetScreen, setIncomingBrowseProfileTargetScreen] = useState<AppScreenMode | null>(null);
  const [guestBrowseTransitionFrom, setGuestBrowseTransitionFrom] = useState<'splash' | 'browse' | null>(null);
  const [incomingGuestBrowseScreen, setIncomingGuestBrowseScreen] = useState<'splash' | 'browse' | null>(null);
  const [showLoginSuccessTransition, setShowLoginSuccessTransition] = useState(false);
  const [showLogoutTransition, setShowLogoutTransition] = useState(false);
  const [authIntroPending, setAuthIntroPending] = useState(false);
  const [splashExiting, setSplashExiting] = useState(false);
  const [startupImagesReady, setStartupImagesReady] = useState(false);
  const [profileEntryOffset, setProfileEntryOffset] = useState(0);
  const [browseEntryOffset, setBrowseEntryOffset] = useState(0);
  const [mapPreviewPhotoLightboxVisible, setMapPreviewPhotoLightboxVisible] = useState(false);
  const [mapPreviewPhotoLightboxIndex, setMapPreviewPhotoLightboxIndex] = useState(0);
  const [userCoordinates, setUserCoordinates] = useState<UserCoordinates | null>(null);
  const [renderedMappedPlaces, setRenderedMappedPlaces] = useState<MappedPlace[]>([]);
  const [renderedMappedPlaceKey, setRenderedMappedPlaceKey] = useState('');
  const authenticatedSessionRef = useRef<SignupResponse | null>(null);
  const businessLocationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const userLocationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const businessLocationLastReportedRef = useRef<string>('');
  const claimPrefillRequestRef = useRef(0);
  const claimPrefillLoadedKeyRef = useRef('');
  const startupImageLoadCountRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const pushRegistrationAuthTokenRef = useRef('');
  const lastHandledNotificationResponseIdRef = useRef('');
  const openFavoriteBusinessFromNotificationRef = useRef<(slug: string) => void>(() => undefined);
  const shouldUseNativeMapBoundaries = false;
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedDeferredSearchQuery = normalizeSearchText(deferredSearchQuery);
  const onboardingTransitionDuration = 480;
  const showTransitionMapBrowse = browseProfileTransitionFrom !== null
    && incomingBrowseProfileScreen !== null
    && browseProfileTransitionFrom !== incomingBrowseProfileScreen
    && !selectedPlaceSlug
    && browseMode === 'map'
    && (browseProfileTransitionFrom === 'browse' || incomingBrowseProfileScreen === 'browse');
  const showMapBrowse = (screenMode === 'browse' && !selectedPlaceSlug && browseMode === 'map') || showTransitionMapBrowse;
  const shouldTrackUserLocation = screenMode === 'browse' || selectedPlaceSlug !== null;
  const translucentStatusBar = (screenMode === 'browse' && !selectedPlaceSlug && browseMode === 'map')
    || (browseProfileTransitionFrom === 'profiles'
      && incomingBrowseProfileScreen === 'browse'
      && !selectedPlaceSlug
      && browseMode === 'map');

  const filteredPlaces = useMemo(() => getFilteredPlaces(places, {
    confirmedDealsOnly,
    informalBusinessesOnly,
    searchQuery: normalizedDeferredSearchQuery,
    selectedCity,
    selectedDealDays,
    selectedOperatingDays,
    selectedVenueTypes,
    verifiedBusinessesOnly,
  }), [
    confirmedDealsOnly,
    informalBusinessesOnly,
    normalizedDeferredSearchQuery,
    places,
    selectedCity,
    selectedDealDays,
    selectedOperatingDays,
    selectedVenueTypes,
    verifiedBusinessesOnly,
  ]);
  const filteredPlaceKey = useMemo(() => filteredPlaces.map((place) => place.id).join('|'), [filteredPlaces]);
  const filteredBrowseLocations = useMemo(() => getFilteredBrowseLocations(filteredPlaces, {
    confirmedDealsOnly,
    searchQuery: normalizedDeferredSearchQuery,
    selectedCity,
    selectedDealDays,
    selectedOperatingDays,
  }), [
    confirmedDealsOnly,
    filteredPlaces,
    normalizedDeferredSearchQuery,
    selectedCity,
    selectedDealDays,
    selectedOperatingDays,
  ]);
  const displayedBrowsePlaces = useMemo(() => getBrowsePlacesForDisplay(filteredBrowseLocations), [filteredBrowseLocations]);

  const mappedPlaces = useMemo(() => (showMapBrowse ? getMappedPlacesForBrowse(filteredBrowseLocations) : []), [filteredBrowseLocations, showMapBrowse]);
  const browseResultCount = displayedBrowsePlaces.length;
  const mappedPlaceKey = useMemo(() => mappedPlaces.map((place) => place.markerKey).join('|'), [mappedPlaces]);
  const displayedMapPlaces = showMapBrowse
    ? normalizedDeferredSearchQuery.length > 0
      ? mappedPlaces
      : renderedMappedPlaces
    : [];
  const unplacedPlaceCount = useMemo(() => filteredPlaces.filter((place) => (
    !getPlaceLocations(place).some((location) => location.latitude !== null && location.longitude !== null)
  )).length, [filteredPlaces]);
  const selectedMapPlace = selectedMapPlaceKey
    ? displayedMapPlaces.find((place) => place.markerKey === selectedMapPlaceKey) ?? null
    : null;
  const activeMapPreviewPlace = selectedMapPlace ?? selectedMapSearchPreviewPlace;
  const displayedMapPreviewImageUrls = displayedMapPreviewPlace ? dedupeImageUrls(displayedMapPreviewPlace.image_urls) : [];
  const selectedPlaceLocation = getSelectedPlaceLocation(selectedPlace, selectedLocationId, selectedCity);
  const selectedPlaceDeals = selectedPlaceLocation?.deals ?? selectedPlace?.deals ?? [];
  const selectedPlaceOperatingHours = selectedPlaceLocation?.operating_hours ?? selectedPlace?.operating_hours ?? [];
  const selectedPlaceDistanceLabel = getDistanceAwayLabel(userCoordinates, selectedPlaceLocation ?? selectedPlace);
  const guestMapOnlyMode = guestBrowseModeLocked && !authenticatedSession;
  const selectedPlaceIsFavorited = !!(selectedPlace && authenticatedSession?.favorite_businesses?.some((business) => business.slug === selectedPlace.slug));
  const showFavoriteControl = !authenticatedSession || authenticatedSession.portal === 'customer';
  const showClaimBusinessControl = !!selectedPlace && !selectedPlace.is_claimed && (!authenticatedSession || authenticatedSession.portal === 'customer');
  const selectedPlaceIsOwnedByAuthenticatedBusiness = !!(
    selectedPlace
    && authenticatedSession?.profile_type === 'business'
    && authenticatedSession.approved_businesses?.some((business) => business.slug === selectedPlace.slug)
  );
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
    openFavoriteBusinessFromNotificationRef.current = (slug: string) => {
      if (!slug) {
        return;
      }

      setScreenMode('browse');
      handleOpenFavoriteBusiness(slug);
    };
  });

  useEffect(() => {
    let isActive = true;

    async function restoreNotificationNavigation() {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (!isActive || !response) {
          return;
        }

        handleNotificationResponse(response);
      } catch {
        // Ignore notification restoration failures.
      }
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response);
    });

    void restoreNotificationNavigation();

    return () => {
      isActive = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const authToken = authenticatedSession?.auth_token ?? '';
    const portal = authenticatedSession?.portal;

    if (!authToken || portal !== 'customer') {
      pushRegistrationAuthTokenRef.current = '';
      return;
    }

    if (pushRegistrationAuthTokenRef.current === authToken) {
      return;
    }

    pushRegistrationAuthTokenRef.current = authToken;
    let cancelled = false;

    async function registerCurrentDeviceForPush() {
      try {
        const registration = await registerForPushNotificationsAsync();
        if (!registration || cancelled) {
          return;
        }

        await registerPushDevice(apiBaseUrl, authToken, {
          installation_id: registration.installationId,
          push_token: registration.pushToken,
          platform: registration.platform,
          portal,
        });
      } catch {
        // Leave push registration as a best-effort enhancement.
      }
    }

    void registerCurrentDeviceForPush();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, authenticatedSession?.auth_token, authenticatedSession?.portal]);

  function setAuthenticatedSessionIfCurrentToken(expectedAuthToken: string, session: SignupResponse) {
    if (authenticatedSessionRef.current?.auth_token !== expectedAuthToken) {
      return false;
    }

    setAuthenticatedSession(session);
    return true;
  }

  useEffect(() => {
    let cancelled = false;

    async function startUserLocationTracking() {
      if (!shouldTrackUserLocation) {
        userLocationWatcherRef.current?.remove();
        userLocationWatcherRef.current = null;
        return;
      }

      if (userLocationWatcherRef.current) {
        return;
      }

      try {
        const currentPermission = await Location.getForegroundPermissionsAsync();
        if (cancelled) {
          return;
        }

        const permission = currentPermission.granted
          ? currentPermission
          : currentPermission.canAskAgain
            ? await Location.requestForegroundPermissionsAsync()
            : currentPermission;

        if (cancelled) {
          return;
        }

        if (!permission.granted) {
          setUserCoordinates(null);
          return;
        }

        const updateCoordinates = (coords: { latitude: number; longitude: number }) => {
          setUserCoordinates((current) => {
            if (
              current
              && Math.abs(current.latitude - coords.latitude) < 0.0001
              && Math.abs(current.longitude - coords.longitude) < 0.0001
            ) {
              return current;
            }

            return {
              latitude: coords.latitude,
              longitude: coords.longitude,
            };
          });
        };

        const initialPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) {
          return;
        }
        updateCoordinates(initialPosition.coords);

        const watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 100,
            timeInterval: 60000,
          },
          (position) => {
            updateCoordinates(position.coords);
          },
        );

        if (cancelled) {
          watcher.remove();
          return;
        }

        userLocationWatcherRef.current = watcher;
      } catch {
        if (!cancelled) {
          setUserCoordinates(null);
        }
      }
    }

    void startUserLocationTracking();

    return () => {
      cancelled = true;
      userLocationWatcherRef.current?.remove();
      userLocationWatcherRef.current = null;
    };
  }, [shouldTrackUserLocation]);

  useEffect(() => {
    if (guestMapOnlyMode && browseMode !== 'map') {
      handleBrowseModeChange('map');
    }
  }, [browseMode, guestMapOnlyMode]);

  useEffect(() => {
    if (authenticatedSession) {
      setGuestBrowseModeLocked(false);
      setShowGuestFavoritePrompt(false);
      setShowGuestBusinessClaimPrompt(false);
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

          const approvedBusinessSlugs = new Set((currentSession.approved_businesses ?? []).map((business) => business.slug));

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
              setAuthenticatedSessionIfCurrentToken(currentSession.auth_token, response);
              if (approvedBusinessSlugs.size > 0) {
                setPlaces((current) => current.map((place) => applyTrackedCoordinatesToBusiness(
                  place,
                  approvedBusinessSlugs,
                  coords.latitude,
                  coords.longitude,
                )));
                setProfilePlaces((current) => current.map((place) => applyTrackedCoordinatesToBusiness(
                  place,
                  approvedBusinessSlugs,
                  coords.latitude,
                  coords.longitude,
                )));
                setSelectedPlace((current) => current ? applyTrackedCoordinatesToBusinessDetail(
                  current,
                  approvedBusinessSlugs,
                  coords.latitude,
                  coords.longitude,
                ) : current);
              }
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

  const mapSearchResultPool = normalizedDeferredSearchQuery.length ? getMapSearchResults(filteredBrowseLocations) : [];
  const mapSearchResultsKey = mapSearchResultPool.map((place) => place.resultKey).join('|');
  const bottomNavHeight = Math.max(insets.bottom + 76, 90);
  const mapOverlayBottomPadding = bottomNavHeight + 18;
  const floatingDashboardButtonOffset = bottomNavHeight + 16;
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

  function invalidateMapResultsCardTransitions() {
    mapResultsCardTransitionVersionRef.current += 1;
    clearShowMoreMapResultsTimer();
  }

  function animateShellFade(scope: ShellFadeScope) {
    const targetTransition = scope === 'browse' ? browseSceneTransition : profileSceneTransition;

    setShellFadeScope(scope);
    if (scope === 'browse') {
      setBrowseEntryOffset(0);
    } else {
      setProfileEntryOffset(0);
    }

    targetTransition.stopAnimation();
    targetTransition.setValue(0);
    requestAnimationFrame(() => {
      Animated.timing(targetTransition, {
        duration: shellFadeDurationMs,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }

        setShellFadeScope((current) => (current === scope ? null : current));
      });
    });
  }

  function openBottomMoreSheet() {
    bottomMoreSheetClosingRef.current = false;
    setBottomMoreSheetVisible(true);
    bottomMoreSheetProgress.stopAnimation();
    bottomMoreSheetDragY.stopAnimation();
    bottomMoreSheetProgress.setValue(0);
    bottomMoreSheetDragY.setValue(0);
    requestAnimationFrame(() => {
      Animated.timing(bottomMoreSheetProgress, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start();
    });
  }

  function closeBottomMoreSheet(afterClose?: () => void, options?: { dragTargetY?: number; duration?: number }) {
    if (!bottomMoreSheetVisible) {
      afterClose?.();
      return;
    }

    if (bottomMoreSheetClosingRef.current) {
      return;
    }

    bottomMoreSheetClosingRef.current = true;
    bottomMoreSheetProgress.stopAnimation();
    bottomMoreSheetDragY.stopAnimation();
    Animated.parallel([
      Animated.timing(bottomMoreSheetProgress, {
        duration: options?.duration ?? 220,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(bottomMoreSheetDragY, {
        duration: options?.duration ?? 220,
        easing: Easing.out(Easing.cubic),
        toValue: options?.dragTargetY ?? 0,
        useNativeDriver: true,
      }),
    ]).start(() => {
      bottomMoreSheetProgress.setValue(0);
      bottomMoreSheetDragY.setValue(0);
      bottomMoreSheetClosingRef.current = false;
      setBottomMoreSheetVisible(false);
      afterClose?.();
    });
  }

  function dismissBottomMoreSheetByDrag(translationY: number) {
    closeBottomMoreSheet(undefined, {
      dragTargetY: Math.max(translationY, 260),
      duration: 180,
    });
  }

  const bottomMoreSheetTranslateY = Animated.add(
    bottomMoreSheetProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [42, 0],
    }),
    bottomMoreSheetDragY.interpolate({
      inputRange: [-240, 0, 360],
      outputRange: [0, 0, 360],
      extrapolate: 'clamp',
    }),
  );

  const handleBottomMoreSheetGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: bottomMoreSheetDragY } }],
    { useNativeDriver: true },
  );

  function handleBottomMoreSheetStateChange(event: { nativeEvent: { oldState: number; state: number; translationY: number; velocityY: number } }) {
    const { nativeEvent } = event;
    if (nativeEvent.oldState !== State.ACTIVE && nativeEvent.state !== State.END) {
      return;
    }

    const shouldDismiss = nativeEvent.translationY > 90 || nativeEvent.velocityY > 1100;
    if (shouldDismiss) {
      dismissBottomMoreSheetByDrag(nativeEvent.translationY);
      return;
    }

    Animated.spring(bottomMoreSheetDragY, {
      damping: 22,
      mass: 0.7,
      stiffness: 240,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }

  function fadeIntoMainShellScreen(nextScreen: MainShellScreen) {
    const scope: ShellFadeScope = nextScreen === 'browse' || nextScreen === 'home-feed' ? 'browse' : 'profile';
    const navigate = () => {
      setScreenMode(nextScreen);
      animateShellFade(scope);
    };

    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    setProfileMessage(null);
    setSelectedPlaceSlug(null);

    if (bottomMoreSheetVisible) {
      closeBottomMoreSheet(navigate);
      return;
    }

    navigate();
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
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (nextAppState !== 'active') {
        clearShowMoreMapResultsTimer();
        clearAutoFitMapRegionTimer();
        clearMapMarkersTrackViewChangesTimer();
        return;
      }

      if (previousAppState === 'active' || !showMapBrowse) {
        return;
      }

      setMapMarkersTrackViewChanges(true);
      clearMapMarkersTrackViewChangesTimer();
      mapMarkersTrackViewChangesTimeoutRef.current = setTimeout(() => {
        setMapMarkersTrackViewChanges(false);
        mapMarkersTrackViewChangesTimeoutRef.current = null;
      }, 1200);
    });

    return () => {
      subscription.remove();
    };
  }, [showMapBrowse]);

  useEffect(() => {
    if (!bottomMoreSheetVisible || authenticatedSession) {
      return;
    }

    bottomMoreSheetClosingRef.current = false;
    setBottomMoreSheetVisible(false);
    bottomMoreSheetProgress.stopAnimation();
    bottomMoreSheetDragY.stopAnimation();
    bottomMoreSheetProgress.setValue(0);
    bottomMoreSheetDragY.setValue(0);
  }, [authenticatedSession, bottomMoreSheetDragY, bottomMoreSheetProgress, bottomMoreSheetVisible]);

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
  const onboardingScreenKeys = new Set<AppScreenMode>(['splash', 'auth', 'profiles', 'favorite-businesses', 'business-notifications', 'business-profile-editor', 'settings', 'blocked-direct-message-customers', 'support', 'privacy-policy', 'terms-of-service', 'direct-messages', 'business-search', 'business-claim', 'manual-business-claim', 'informal-business-claim', 'email-verification', 'business-claim-review-pending']);
  const profileStackTransitionScreens = new Set<AppScreenMode>(['profiles', 'favorite-businesses', 'business-notifications', 'business-profile-editor', 'settings', 'blocked-direct-message-customers', 'support', 'privacy-policy', 'terms-of-service', 'direct-messages']);
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
  const splashReturnOutgoingStyle = {
    transform: [
      {
        translateX: screenTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0, width],
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
  const browseShellFadeMaskStyle = {
    opacity: browseSceneTransition.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
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
  const loginSuccessBottomNavStyle = {
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
  const shouldAnimateLoginSuccessBottomNav = !isNativeIOSLiquidGlassBottomNavAvailable();

  const shouldShowMapResults = showMapBrowse && !activeMapPreviewPlace && normalizedDeferredSearchQuery.length > 0;
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
          if (setAuthenticatedSessionIfCurrentToken(currentSession.auth_token, response)) {
            setScreenMode('profiles');
          }
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
    const shouldPreserveRenderedMapPins = !showMapBrowse && browseMode === 'map' && selectedPlaceSlug !== null;
    const shouldDelayPinsUntilBrowseScreenSettles = screenMode !== 'browse' && showTransitionMapBrowse;
    const shouldDelayPinsUntilBrowseFadeSettles = shellFadeScope === 'browse' && screenMode === 'browse' && showMapBrowse;

    if (shouldPreserveRenderedMapPins) {
      mapPinsTransition.stopAnimation();
      mapPinsTransition.setValue(1);
      return;
    }

    if (shouldDelayPinsUntilBrowseScreenSettles || shouldDelayPinsUntilBrowseFadeSettles) {
      if (renderedMappedPlaces.length || renderedMappedPlaceKey) {
        setRenderedMappedPlaces([]);
        setRenderedMappedPlaceKey('');
      }
      mapPinsTransition.stopAnimation();
      mapPinsTransition.setValue(1);
      return;
    }

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

    if (normalizedDeferredSearchQuery.length > 0) {
      pendingImmediateMapPinsRefreshRef.current = false;
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
  }, [browseMode, listLoading, mapPinsTransition, mappedPlaceKey, mappedPlaces, normalizedDeferredSearchQuery.length, renderedMappedPlaceKey, renderedMappedPlaces.length, screenMode, selectedPlaceSlug, shellFadeScope, showMapBrowse, showTransitionMapBrowse]);

  function navigateScreen(
    nextScreen: AppScreenMode,
    direction: OnboardingTransitionDirection,
    transitionOverride?: { axis: TransitionAxis; incomingOffset: number },
  ) {
    const currentScreen = screenMode;
    const shouldAnimateSplashReturn = nextScreen === 'splash'
      && !authenticatedSession
      && !selectedPlaceSlug
      && onboardingScreenKeys.has(currentScreen)
      && currentScreen !== 'splash';
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

    if (shouldAnimateSplashReturn) {
      setBrowseProfileTransitionFrom(null);
      setIncomingBrowseProfileScreen(null);
      setIncomingBrowseProfileTargetScreen(null);
      setIncomingOnboardingScreen(null);
      setGuestBrowseTransitionFrom(null);
      setIncomingGuestBrowseScreen(null);
      setReturningToSplashScreen(currentScreen);
      screenTransition.setValue(0);
      onboardingTransitionFrameRef.current = null;
      Animated.timing(screenTransition, {
        duration: onboardingTransitionDuration,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          setReturningToSplashScreen(null);
          return;
        }

        setReturningToSplashScreen(null);
        setScreenMode('splash');
        screenTransition.setValue(1);
      });
      return;
    }

    if (!shouldAnimateOnboarding) {
      setBrowseProfileTransitionFrom(null);
      setIncomingBrowseProfileScreen(null);
      setIncomingBrowseProfileTargetScreen(null);
      setIncomingOnboardingScreen(null);
      setReturningToSplashScreen(null);
      screenTransition.setValue(1);
      setScreenMode(nextScreen);
      return;
    }

    screenTransition.setValue(0);
    setReturningToSplashScreen(null);
    setIncomingOnboardingScreen(nextScreen);
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
  }

  function navigateBrowseProfileTransition(nextScreen: 'profiles' | 'browse', finalScreenMode?: AppScreenMode, onComplete?: () => void) {
    const resolvedScreenMode = finalScreenMode ?? nextScreen;

    if (screenMode === resolvedScreenMode) {
      return;
    }

    const currentBrowseProfileScreen = ['profiles', 'favorite-businesses', 'business-notifications', 'business-profile-editor', 'settings', 'blocked-direct-message-customers', 'support', 'privacy-policy', 'terms-of-service', 'direct-messages'].includes(screenMode)
      ? 'profiles'
      : 'browse';
    const shouldPrewarmIncomingScreen = currentBrowseProfileScreen === 'browse' && browseMode === 'map' && nextScreen === 'profiles';

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
    setIncomingBrowseProfileTargetScreen(null);
    setIncomingOnboardingScreen(null);
    setReturningToSplashScreen(null);
    screenTransition.setValue(0);
    setIncomingBrowseProfileScreen(nextScreen);
    setIncomingBrowseProfileTargetScreen(resolvedScreenMode);
    const startAnimation = () => {
      onboardingTransitionFrameRef.current = null;
      Animated.timing(screenTransition, {
        duration: onboardingTransitionDuration,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          setBrowseProfileTransitionFrom(null);
          setIncomingBrowseProfileScreen(null);
          setIncomingBrowseProfileTargetScreen(null);
          return;
        }

        setScreenMode(resolvedScreenMode);
        profileSceneTransition.setValue(1);
        browseSceneTransition.setValue(1);
        setProfileEntryOffset(0);
        setBrowseEntryOffset(0);
        setBrowseProfileTransitionFrom(null);
        setIncomingBrowseProfileScreen(null);
        setIncomingBrowseProfileTargetScreen(null);
        screenTransition.setValue(1);
        onComplete?.();
      });
    };

    if (shouldPrewarmIncomingScreen) {
      onboardingTransitionFrameRef.current = requestAnimationFrame(() => {
        startAnimation();
      });
      return;
    }

    startAnimation();
  }

  function navigateGuestBrowseTransition(nextScreen: 'splash' | 'browse', onComplete?: () => void) {
    if (screenMode === nextScreen) {
      onComplete?.();
      return;
    }

    const currentGuestBrowseScreen = screenMode === 'splash' ? 'splash' : 'browse';
  const shouldPrewarmIncomingScreen = currentGuestBrowseScreen === 'browse' && browseMode === 'map' && nextScreen === 'splash';

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
    setIncomingBrowseProfileTargetScreen(null);
    setIncomingOnboardingScreen(null);
    setReturningToSplashScreen(null);
    setGuestBrowseTransitionFrom(currentGuestBrowseScreen);
    setIncomingGuestBrowseScreen(null);
    screenTransition.setValue(0);
    setIncomingGuestBrowseScreen(nextScreen);
    const startAnimation = () => {
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
    };

    if (shouldPrewarmIncomingScreen) {
      onboardingTransitionFrameRef.current = requestAnimationFrame(() => {
        startAnimation();
      });
      return;
    }

    startAnimation();
  }

  function warmMapShellThen(startTransition: () => void) {
    if (onboardingTransitionFrameRef.current !== null) {
      cancelAnimationFrame(onboardingTransitionFrameRef.current);
    }

    onboardingTransitionFrameRef.current = requestAnimationFrame(() => {
      onboardingTransitionFrameRef.current = null;
      startTransition();
    });
  }

  function startLoginSuccessTransition() {
    dismissKeyboardForScreenTransition();
    setShouldAutoFocusLoginField(false);

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
  bottomMoreSheetProgress.stopAnimation();
  bottomMoreSheetProgress.setValue(0);
  setBottomMoreSheetVisible(false);
  setShellFadeScope(null);
    setIncomingOnboardingScreen(null);
  setReturningToSplashScreen(null);
  setBrowseProfileTransitionFrom(null);
  setIncomingBrowseProfileScreen(null);
  setIncomingBrowseProfileTargetScreen(null);
  setGuestBrowseTransitionFrom(null);
  setIncomingGuestBrowseScreen(null);
  setSelectedPlaceSlug(null);
  setSelectedPlace(null);
  setSelectedLocationId(null);
  setSelectedMapPlaceKey(null);
  setDisplayedMapPreviewPlace(null);
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

  function handleOpenMapPreviewPhotoLightbox(index: number) {
    setMapPreviewPhotoLightboxIndex(index);
    setMapPreviewPhotoLightboxVisible(true);
  }

  useEffect(() => {
    if (shouldShowMapResults) {
      const resultsChanged = (
        mapSearchResultsKey !== renderedMapResultsKey ||
        mapSearchResultPool.length !== renderedMapResultCount
      );

      if (resultsChanged) {
        invalidateMapResultsCardTransitions();
      }

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
    const transitionVersion = mapResultsCardTransitionVersionRef.current + 1;
    mapResultsCardTransitionVersionRef.current = transitionVersion;
    Animated.timing(mapResultsOpacity, {
      duration: 160,
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || mapResultsCardTransitionVersionRef.current !== transitionVersion) {
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
    invalidateMapResultsCardTransitions();
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
        if (selectedCity === 'all') {
          allPlacesCacheRef.current = {
            apiBaseUrl,
            places: nextPlaces,
            reloadCount,
          };
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const seededPlaces = getSeededPlaces(selectedCity);
        if (seededPlacesAvailable() && seededPlaces.length > 0) {
          setErrorMessage(seedDataFallbackMessage);
          setPlaces(seededPlaces);
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

        const seededPlaceDetail = getSeededPlaceDetail(placeSlug);
        if (seededPlaceDetail) {
          setErrorMessage(seedDataFallbackMessage);
          setSelectedPlace(seededPlaceDetail);
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
    if (shouldSkipBrowseMapAutoFit({
      listLoading,
      mappedPlaceCount: mappedPlaces.length,
      normalizedSearchQuery: normalizedDeferredSearchQuery,
      showMapBrowse,
    })) {
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
    }, normalizedDeferredSearchQuery.length > 0 ? 140 : 0);
  }, [filteredPlaceKey, listLoading, mappedPlaces.length, normalizedDeferredSearchQuery.length, selectedCity, showMapBrowse]);

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

    const cachedAllPlaces = allPlacesCacheRef.current;

    if (selectedCity === 'all' && places.length > 0) {
      setProfilePlaces(places);
      setProfilePlacesLoading(false);
      return;
    }

    if (cachedAllPlaces && cachedAllPlaces.apiBaseUrl === apiBaseUrl && cachedAllPlaces.reloadCount === reloadCount) {
      setProfilePlaces(cachedAllPlaces.places);
      setProfilePlacesLoading(false);
      return;
    }

    let isMounted = true;
    setProfilePlacesLoading(true);

    void fetchPlaces(apiBaseUrl, 'all').then((nextPlaces) => {
      if (!isMounted) {
        return;
      }

      allPlacesCacheRef.current = {
        apiBaseUrl,
        places: nextPlaces,
        reloadCount,
      };
      setProfilePlaces(nextPlaces);
    }).catch((error) => {
      if (!isMounted) {
        return;
      }

      const seededPlaces = getSeededPlaces('all');
      if (seededPlacesAvailable() && seededPlaces.length > 0) {
        setProfileErrorMessage(seedDataFallbackMessage);
        setProfilePlaces(seededPlaces);
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
  }, [apiBaseUrl, places, reloadCount, screenMode, selectedCity]);

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
              instagram_profile: current.instagram_profile || prefill.instagram_profile,
              facebook_profile: current.facebook_profile || prefill.facebook_profile,
              tiktok_profile: current.tiktok_profile || prefill.tiktok_profile,
              youtube_profile: current.youtube_profile || prefill.youtube_profile,
              deal_overrides: current.deal_overrides.length ? current.deal_overrides : prefill.deal_overrides,
              operating_hour_overrides: current.operating_hour_overrides.length ? current.operating_hour_overrides : prefill.operating_hour_overrides,
              photo_references_text: current.photo_references_text.trim() ? current.photo_references_text : prefill.photo_references_text,
            };
          });
        });
      })
      .catch(() => {
        if (!isMounted || claimPrefillRequestRef.current !== requestId) {
          return;
        }

        const seededDetail = getSeededPlaceDetail(profileForm.business_slug);
        if (!seededDetail) {
          return;
        }

        const prefill = buildClaimPrefill(seededDetail, selectedClaimLocationId);
        claimPrefillLoadedKeyRef.current = prefillKey;

        startTransition(() => {
          setSelectedClaimPlace(seededDetail);
          setSelectedClaimLocationId(prefill.locationId);
          setProfileErrorMessage(seedDataFallbackMessage);
          setProfileForm((current) => {
            if (current.business_slug !== profileForm.business_slug) {
              return current;
            }

            return {
              ...current,
              business_city: current.business_city || prefill.business_city,
              business_venue_type: current.business_venue_type || prefill.business_venue_type,
              business_website_url: current.business_website_url || prefill.business_website_url,
              instagram_profile: current.instagram_profile || prefill.instagram_profile,
              facebook_profile: current.facebook_profile || prefill.facebook_profile,
              tiktok_profile: current.tiktok_profile || prefill.tiktok_profile,
              youtube_profile: current.youtube_profile || prefill.youtube_profile,
              deal_overrides: current.deal_overrides.length ? current.deal_overrides : prefill.deal_overrides,
              operating_hour_overrides: current.operating_hour_overrides.length ? current.operating_hour_overrides : prefill.operating_hour_overrides,
              photo_references_text: current.photo_references_text.trim() ? current.photo_references_text : prefill.photo_references_text,
            };
          });
        });
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
    if (!showMapBrowse || !selectedMapSearchPreviewPlace) {
      if (!showMapBrowse && selectedMapSearchPreviewPlace !== null) {
        setSelectedMapSearchPreviewPlace(null);
      }
      return;
    }

    const previewStillAvailable = filteredBrowseLocations.some(({ location, place }) => (
      place.slug === selectedMapSearchPreviewPlace.slug && location.id === selectedMapSearchPreviewPlace.locationId
    ));

    if (!previewStillAvailable) {
      setSelectedMapSearchPreviewPlace(null);
    }
  }, [filteredBrowseLocations, selectedMapSearchPreviewPlace, showMapBrowse]);

  useEffect(() => {
    if (!showMapBrowse) {
      mapPreviewOpacity.stopAnimation();
      mapPreviewOpacity.setValue(0);
      if (displayedMapPreviewPlace !== null) {
        setDisplayedMapPreviewPlace(null);
      }
      return;
    }

    if (activeMapPreviewPlace) {
      setDisplayedMapPreviewPlace(activeMapPreviewPlace);
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
      if (!finished || activeMapPreviewPlace !== null) {
        return;
      }

      setDisplayedMapPreviewPlace(null);
    });
  }, [activeMapPreviewPlace, displayedMapPreviewPlace, mapPreviewOpacity, showMapBrowse]);

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

  const handleSelectPlace = useCallback((place: { slug: string; locationId?: number }) => {
    dismissKeyboardForScreenTransition();
    animateNextLayout();
    setDetailLoading(true);
    setBrowseFiltersExpanded(false);
    setSelectedMapPlaceKey(null);
    setSelectedPlace(null);
    setSelectedLocationId(place.locationId ?? null);
    setSelectedPlaceSlug(place.slug);
  }, []);

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

  function handleToggleInformalBusinessesOnly() {
    animateNextLayout();
    setInformalBusinessesOnly((current) => !current);
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
    invalidateMapResultsCardTransitions();
    setBrowseFiltersExpanded((current) => !current);
  }

  function handleToggleMapSearchPanelLift() {
    invalidateMapResultsCardTransitions();
    setMapSearchPanelLifted((current) => !current);
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
    pendingImmediateMapPinsRefreshRef.current = true;
    invalidateMapResultsCardTransitions();
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
  }

  function handleBackToBrowse() {
    animateNextLayout();
    Keyboard.dismiss();
    setSelectedPlaceSlug(null);

    if (screenMode === 'profiles' || screenMode === 'business-profile-editor') {
      animateShellFade('profile');
      return;
    }

    animateShellFade('browse');
  }

  function fadeIntoProfileScreen(nextScreen: 'profiles' | 'business-profile-editor') {
    dismissKeyboardForScreenTransition();
    setSelectedPlaceSlug(null);
    setProfileEntryOffset(0);
    setScreenMode(nextScreen);
    profileSceneTransition.stopAnimation();
    profileSceneTransition.setValue(0);
    Animated.timing(profileSceneTransition, {
      duration: 220,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }

  const handleRefreshDirectMessageThreads = useCallback(async () => {
    if (!authenticatedSession?.auth_token) {
      return [] as DirectMessageThread[];
    }

    return fetchDirectMessageThreads(apiBaseUrl, authenticatedSession.auth_token, authenticatedSession.portal);
  }, [apiBaseUrl, authenticatedSession?.auth_token, authenticatedSession?.portal]);

  const handleLoadDirectMessageThreadDetail = useCallback(async (threadId: number) => {
    if (!authenticatedSession?.auth_token) {
      throw new Error('Sign in to load direct messages.');
    }

    return fetchDirectMessageThreadDetail(apiBaseUrl, authenticatedSession.auth_token, threadId, authenticatedSession.portal);
  }, [apiBaseUrl, authenticatedSession?.auth_token, authenticatedSession?.portal]);

  const handleSendTextDirectMessage = useCallback(async (payload: { listingSlug?: string; message: string; threadId?: number }) => {
    if (!authenticatedSession?.auth_token) {
      throw new Error('Sign in to send direct messages.');
    }

    return sendDirectMessage(apiBaseUrl, authenticatedSession.auth_token, {
      portal: authenticatedSession.portal,
      listing_slug: payload.listingSlug,
      thread_id: payload.threadId,
      message: payload.message,
    });
  }, [apiBaseUrl, authenticatedSession?.auth_token, authenticatedSession?.portal]);

  const handleSendImageDirectMessage = useCallback(async (threadId: number, image: BusinessAttachmentDraft) => {
    if (!authenticatedSession?.auth_token) {
      throw new Error('Sign in to send direct messages.');
    }

    if (authenticatedSession.portal !== 'business') {
      throw new Error('Only business accounts can send direct message images.');
    }

    return sendDirectMessageImage(apiBaseUrl, authenticatedSession.auth_token, {
      portal: 'business',
      thread_id: threadId,
      image,
    });
  }, [apiBaseUrl, authenticatedSession?.auth_token, authenticatedSession?.portal]);

  const handleDeleteDirectMessageConversation = useCallback(async (threadId: number) => {
    if (!authenticatedSession?.auth_token || authenticatedSession.portal !== 'business') {
      throw new Error('Only business accounts can delete direct message conversations.');
    }

    const response = await deleteBusinessDirectMessageThread(apiBaseUrl, authenticatedSession.auth_token, threadId);
    setProfileMessage(response.detail ?? 'Conversation deleted from your inbox.');
  }, [apiBaseUrl, authenticatedSession?.auth_token, authenticatedSession?.portal]);

  const handleBlockCustomerFromDirectMessages = useCallback(async (customerUsername: string) => {
    if (!authenticatedSession?.auth_token || authenticatedSession.portal !== 'business') {
      throw new Error('Only business accounts can block customer direct messages.');
    }

    const currentAuthToken = authenticatedSession.auth_token;
    const response = await blockBusinessDirectMessagesForCustomer(apiBaseUrl, currentAuthToken, customerUsername);
    setAuthenticatedSessionIfCurrentToken(currentAuthToken, response);
    setProfileMessage(`Direct messaging blocked for ${customerUsername}.`);
  }, [apiBaseUrl, authenticatedSession?.auth_token, authenticatedSession?.portal]);

  function openDirectMessagesScreen() {
    dismissKeyboardForScreenTransition();
    setProfileEntryOffset(0);
    navigateScreen('direct-messages', 'forward');
  }

  function handleBackFromDirectMessages() {
    dismissKeyboardForScreenTransition();

    if (selectedPlaceSlug) {
      selectedPlaceReturnFade.stopAnimation();
      selectedPlaceReturnFade.setValue(0);
      setSelectedPlaceReturnFadeActive(true);
      setScreenMode('browse');
      requestAnimationFrame(() => {
        Animated.timing(selectedPlaceReturnFade, {
          duration: 220,
          toValue: 1,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!finished) {
            return;
          }

          setSelectedPlaceReturnFadeActive(false);
        });
      });
      return;
    }

    navigateScreen('profiles', 'backward');
  }

  function resetDirectClaimState() {
    claimPrefillRequestRef.current += 1;
    claimPrefillLoadedKeyRef.current = '';
    setBusinessAttachments(initialBusinessAttachments);
    setBusinessPhotoUploads([]);
    setSelectedClaimPlace(null);
    setSelectedClaimLocationId(null);
    setProfileForm(initialProfileFormState);
    setClaimReturnDestination('business-search');
  }

  function startClaimFlowFromSelectedPlace(returnDestination: ClaimReturnDestination) {
    if (!selectedPlace) {
      return;
    }

    dismissKeyboardForScreenTransition();
    const selectedClaimLocation = getPlaceLocations(selectedPlace).find((location) => location.id === selectedLocationId) ?? getPlaceLocations(selectedPlace)[0] ?? selectedPlace;
    const customerSession = authenticatedSession?.portal === 'customer' ? authenticatedSession : null;

    claimPrefillLoadedKeyRef.current = '';
    setProfileErrorMessage(null);
    setProfileMessage(null);
    setClaimReturnDestination(returnDestination);
    setSelectedClaimPlace(selectedPlace);
    setSelectedClaimLocationId(selectedClaimLocation.id);
    setBusinessAttachments(initialBusinessAttachments);
    setBusinessPhotoUploads([]);
    setProfileForm({
      ...resetBusinessVerificationFields(initialProfileFormState),
      username: customerSession?.username ?? '',
      email: customerSession?.email ?? '',
      first_name: customerSession?.first_name ?? '',
      last_name: customerSession?.last_name ?? '',
      business_slug: selectedPlace.slug,
      business_name: selectedPlace.name,
      business_city: selectedClaimLocation.city,
      business_venue_type: selectedPlace.venue_type,
      business_website_url: selectedClaimLocation.website_url || selectedPlace.website_url,
      address_not_applicable: false,
    });
    setSelectedPlaceSlug(null);
    navigateScreen('business-claim', 'forward');
  }

  function handleOpenBusinessClaimFromPlaceDetail() {
    if (!selectedPlace || selectedPlace.is_claimed) {
      return;
    }

    if (!authenticatedSession) {
      setShowGuestBusinessClaimPrompt(true);
      return;
    }

    if (authenticatedSession.portal === 'customer') {
      setShowCustomerBusinessClaimPrompt(true);
    }
  }

  function handleDismissGuestBusinessClaimPrompt() {
    setShowGuestBusinessClaimPrompt(false);
  }

  function handleDismissCustomerBusinessClaimPrompt() {
    setShowCustomerBusinessClaimPrompt(false);
  }

  function handleCreateBusinessAccountFromGuestClaim() {
    setShowGuestBusinessClaimPrompt(false);
    startClaimFlowFromSelectedPlace('browse-map');
  }

  function handleProceedWithCustomerBusinessClaim() {
    setShowCustomerBusinessClaimPrompt(false);
    startClaimFlowFromSelectedPlace('profiles');
  }

  function handleDismissCustomerBusinessClaimNotice() {
    setCustomerBusinessClaimNotice(null);
  }

  function handleOpenFavoriteBusiness(slug: string) {
    animateNextLayout();
    Keyboard.dismiss();
    setErrorMessage(null);
    setDetailLoading(true);
    setSelectedMapPlaceKey(null);
    setSelectedLocationId(null);
    setSelectedPlace(null);
    setSelectedPlaceSlug(slug);
  }

  function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const responseId = response.notification.request.identifier;
    if (lastHandledNotificationResponseIdRef.current === responseId) {
      return;
    }

    lastHandledNotificationResponseIdRef.current = responseId;
    const slug = extractFavoriteBusinessSlugFromNotificationData(response.notification.request.content.data);
    if (!slug) {
      return;
    }

    openFavoriteBusinessFromNotificationRef.current(slug);
  }

  function handleOpenBusinessProfileEditorFromDashboard() {
    if (!authenticatedSession?.approved_businesses?.length) {
      return;
    }

    fadeIntoProfileScreen('business-profile-editor');
  }

  function handleOpenBusinessProfileEditor() {
    if (!selectedPlaceIsOwnedByAuthenticatedBusiness) {
      return;
    }

    fadeIntoProfileScreen('business-profile-editor');
  }

  function handleBackFromBusinessProfileEditor() {
    fadeIntoProfileScreen('profiles');
  }

  function handleViewApprovedBusinessInMap() {
    const approvedBusinessSlug = authenticatedSession?.approved_businesses?.[0]?.slug;
    if (!approvedBusinessSlug) {
      return;
    }

    animateNextLayout();
    Keyboard.dismiss();
    setErrorMessage(null);
    setDetailLoading(true);
    setSelectedMapPlaceKey(null);
    setSelectedLocationId(null);
    setSelectedPlace(null);
    setScreenMode('browse');
    setSelectedPlaceSlug(approvedBusinessSlug);
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
    setShowGuestBusinessClaimPrompt(false);
    setShowCustomerBusinessClaimPrompt(false);
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
    setShowGuestBusinessClaimPrompt(false);
    setShowCustomerBusinessClaimPrompt(false);
    setAuthMessage(null);
    setProfileErrorMessage(null);
    setShouldAutoFocusLoginField(false);
    setShowLoginTwoFactorCodeField(false);
    setLoginForm(initialLoginFormState);

    if (onboardingTransitionFrameRef.current !== null) {
      cancelAnimationFrame(onboardingTransitionFrameRef.current);
      onboardingTransitionFrameRef.current = null;
    }

    navigateScreen('splash', 'backward');
  }

  function handleExitGuestMap() {
    dismissKeyboardForScreenTransition();
    navigateGuestBrowseTransition('splash', () => {
      setShowGuestFavoritePrompt(false);
      setShowGuestBusinessClaimPrompt(false);
      setShowCustomerBusinessClaimPrompt(false);
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
    warmMapShellThen(() => navigateGuestBrowseTransition('browse'));
  }

  function handleDismissGuestFavoritePrompt() {
    setShowGuestFavoritePrompt(false);
  }

  function handleDismissGuestAccuracyPrompt() {
    setShowGuestAccuracyPrompt(false);
  }

  function handleDismissGuestBottomNavPrompt() {
    setShowGuestBottomNavPrompt(false);
  }

  function handleCreateCustomerAccountFromGuestBottomNav() {
    setShowGuestBottomNavPrompt(false);
    setSelectedPlaceSlug(null);
    setSelectedLocationId(null);
    handleOpenProfiles();
  }

  function handleCreateBusinessAccountFromGuestBottomNav() {
    setShowGuestBottomNavPrompt(false);
    setSelectedPlaceSlug(null);
    setSelectedLocationId(null);
    handleOpenBusinessSearch();
  }

  function handleCreateCustomerAccountFromGuestFavorite() {
    setShowGuestFavoritePrompt(false);
    setSelectedPlaceSlug(null);
    setSelectedLocationId(null);
    handleOpenProfiles();
  }

  function handleCreateCustomerAccountFromGuestAccuracy() {
    setShowGuestAccuracyPrompt(false);
    setSelectedPlaceSlug(null);
    setSelectedLocationId(null);
    handleOpenProfiles();
  }

  function handleCreateBusinessAccountFromGuestAccuracy() {
    setShowGuestAccuracyPrompt(false);
    setSelectedPlaceSlug(null);
    setSelectedLocationId(null);
    handleOpenBusinessSearch();
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

  function handleOpenFavoriteBusinesses() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    setProfileMessage(null);
    navigateScreen('favorite-businesses', 'forward');
  }

  function handleBackFromFavoriteBusinesses() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('profiles', 'backward');
  }

  function handleOpenBusinessNotifications() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    setProfileMessage(null);
    navigateScreen('business-notifications', 'forward');
  }

  async function handleClearFavoriteBusinessNotifications() {
    if (!authenticatedSession?.auth_token) {
      setProfileErrorMessage('Sign in again before clearing business notifications.');
      return;
    }

    setDashboardSubmitting(true);
    setProfileErrorMessage(null);
    setProfileMessage(null);

    try {
      const response = await clearFavoriteBusinessNotifications(apiBaseUrl, authenticatedSession.auth_token, authenticatedSession.portal);
      setAuthenticatedSession(response);
      setProfileMessage(response.detail ?? 'Business notifications cleared.');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setDashboardSubmitting(false);
    }
  }

  async function handleClearFavoriteBusinessNotification(notificationId: number) {
    if (!authenticatedSession?.auth_token) {
      setProfileErrorMessage('Sign in again before clearing business notifications.');
      return;
    }

    setDashboardSubmitting(true);
    setProfileErrorMessage(null);
    setProfileMessage(null);

    try {
      const response = await clearFavoriteBusinessNotification(apiBaseUrl, authenticatedSession.auth_token, notificationId, authenticatedSession.portal);
      setAuthenticatedSession(response);
      setProfileMessage(response.detail ?? 'Business notification cleared.');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setDashboardSubmitting(false);
    }
  }

  function handleBackFromBusinessNotifications() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('profiles', 'backward');
  }

  function handleBackFromSupport() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    setProfileMessage(null);
    navigateScreen('settings', 'backward');
  }

  async function handleSubmitSupportRequest(subject: string, message: string) {
    if (!authenticatedSession?.auth_token) {
      setProfileErrorMessage('Sign in again before sending a support message.');
      return;
    }

    setProfileSubmitting(true);
    setProfileErrorMessage(null);
    setProfileMessage(null);

    try {
      const response = await submitSupportRequest(apiBaseUrl, authenticatedSession.auth_token, {
        portal: authenticatedSession.portal,
        subject,
        message,
      });
      setProfileMessage(response.detail);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleSubmitPlaceAccuracyReport(subject: string, message: string) {
    if (!authenticatedSession?.auth_token) {
      throw new Error('Sign in to report business profile updates.');
    }

    if (!selectedPlace) {
      throw new Error('Open a business profile again before sending this report.');
    }

    const locationLabel = selectedPlaceLocation
      ? `${selectedPlaceLocation.city_label} - ${formatPlaceAddress(selectedPlaceLocation)}`
      : formatPlaceAddress(selectedPlace);
    const contextualMessage = [
      `Business: ${selectedPlace.name}`,
      `Slug: ${selectedPlace.slug}`,
      `Location: ${locationLabel}`,
      '',
      message.trim(),
    ].join('\n');

    const response = await submitSupportRequest(apiBaseUrl, authenticatedSession.auth_token, {
      portal: authenticatedSession.portal,
      subject: `Business profile accuracy: ${subject}`,
      message: contextualMessage,
    });

    return response.detail;
  }

  function handleOpenSettings() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    setProfileMessage(null);
    navigateScreen('settings', 'forward');
  }

  function handleOpenBlockedDirectMessageCustomers() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('blocked-direct-message-customers', 'forward');
  }

  function handleBackFromSettings() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('profiles', 'backward');
  }

  function handleBackToSettings() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('settings', 'backward');
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

  function handleBottomNavOpenMap() {
    if (!authenticatedSession) {
      return;
    }

    if (screenMode === 'home-feed') {
      const openMap = () => {
        setBrowseFiltersExpanded(false);
        clearSelectedPlaceRoute();
        handleClearMapSelection();
        setGuestBrowseModeLocked(false);
        browseModeFadePendingRef.current = false;
        pendingListRevealRef.current = false;
        setListRevealEnabled(false);
        browseModeTransition.stopAnimation();
        browseModeTransition.setValue(1);
        handleBrowseModeChange('map');
        warmMapShellThen(() => fadeIntoMainShellScreen('browse'));
      };

      if (bottomMoreSheetVisible) {
        closeBottomMoreSheet(openMap);
        return;
      }

      openMap();
      return;
    }

    if (screenMode === 'browse') {
      if (bottomMoreSheetVisible) {
        closeBottomMoreSheet();
      }

      if (browseMode !== 'map') {
        handleBrowseModeChange('map');
      }

      return;
    }

    setBrowseFiltersExpanded(false);
    setSelectedPlaceSlug(null);
    setSelectedPlace(null);
    setSelectedLocationId(null);
    setSelectedMapPlaceKey(null);
    setGuestBrowseModeLocked(false);
    browseModeFadePendingRef.current = false;
    pendingListRevealRef.current = false;
    setListRevealEnabled(false);
    browseModeTransition.stopAnimation();
    browseModeTransition.setValue(1);
    handleBrowseModeChange('map');
    warmMapShellThen(() => navigateBrowseProfileTransition('browse'));
  }

  function handleBottomNavOpenHomeFeed() {
    if (!authenticatedSession) {
      setShowGuestBottomNavPrompt(true);
      return;
    }

    if (screenMode === 'home-feed') {
      if (bottomMoreSheetVisible) {
        closeBottomMoreSheet();
      }

      return;
    }

    clearSelectedPlaceRoute();
    setBrowseFiltersExpanded(false);
    handleClearMapSelection();

    if (['profiles', 'favorite-businesses', 'business-notifications', 'business-profile-editor', 'settings', 'blocked-direct-message-customers', 'support', 'privacy-policy', 'terms-of-service', 'direct-messages'].includes(screenMode)) {
      navigateBrowseProfileTransition('browse', 'home-feed');
      return;
    }

    const openHomeFeed = () => {
      fadeIntoMainShellScreen('home-feed');
    };

    if (bottomMoreSheetVisible) {
      closeBottomMoreSheet(openHomeFeed);
      return;
    }

    openHomeFeed();
  }

  function handleBottomNavOpenProfile() {
    if (!authenticatedSession) {
      setShowGuestBottomNavPrompt(true);
      return;
    }

    if (screenMode === 'profiles') {
      if (bottomMoreSheetVisible) {
        closeBottomMoreSheet();
      }

      return;
    }

    setSelectedPlaceSlug(null);
    setSelectedPlace(null);
    setSelectedLocationId(null);
    setSelectedMapPlaceKey(null);

    if (['favorite-businesses', 'business-notifications', 'business-profile-editor', 'settings', 'blocked-direct-message-customers', 'support', 'privacy-policy', 'terms-of-service', 'direct-messages'].includes(screenMode)) {
      navigateScreen('profiles', 'backward');
      return;
    }

    if (screenMode === 'home-feed') {
      navigateBrowseProfileTransition('profiles');
      return;
    }

    navigateBrowseProfileTransition('profiles');
  }

  function handleBottomNavOpenMore() {
    if (!authenticatedSession) {
      setShowGuestBottomNavPrompt(true);
      return;
    }

    if (bottomMoreSheetVisible) {
      closeBottomMoreSheet();
      return;
    }

    openBottomMoreSheet();
  }

  function clearSelectedPlaceRoute() {
    setSelectedPlaceSlug(null);
    setSelectedPlace(null);
    setSelectedLocationId(null);
    setSelectedMapPlaceKey(null);
  }

  function handleBottomMenuOpenSettings() {
    if (screenMode === 'settings') {
      closeBottomMoreSheet();
      return;
    }

    clearSelectedPlaceRoute();

    if (screenMode === 'browse' || screenMode === 'home-feed') {
      closeBottomMoreSheet(() => navigateBrowseProfileTransition('profiles', 'settings'));
      return;
    }

    closeBottomMoreSheet(() => navigateScreen('settings', 'forward'));
  }

  function handleBottomMenuOpenFavoriteBusinesses() {
    if (screenMode === 'favorite-businesses') {
      closeBottomMoreSheet();
      return;
    }

    clearSelectedPlaceRoute();

    if (screenMode === 'browse' || screenMode === 'home-feed') {
      closeBottomMoreSheet(() => navigateBrowseProfileTransition('profiles', 'favorite-businesses'));
      return;
    }

    closeBottomMoreSheet(() => navigateScreen('favorite-businesses', 'forward'));
  }

  function handleBottomMenuOpenBusinessNotifications() {
    if (screenMode === 'business-notifications') {
      closeBottomMoreSheet();
      return;
    }

    clearSelectedPlaceRoute();

    if (screenMode === 'browse' || screenMode === 'home-feed') {
      closeBottomMoreSheet(() => navigateBrowseProfileTransition('profiles', 'business-notifications'));
      return;
    }

    closeBottomMoreSheet(() => navigateScreen('business-notifications', 'forward'));
  }

  function handleBottomMenuOpenSupport() {
    setSupportDraftContext(null);
    if (screenMode === 'support') {
      closeBottomMoreSheet();
      return;
    }

    clearSelectedPlaceRoute();

    if (screenMode === 'browse' || screenMode === 'home-feed') {
      closeBottomMoreSheet(() => navigateBrowseProfileTransition('profiles', 'support'));
      return;
    }

    closeBottomMoreSheet(() => navigateScreen('support', 'forward'));
  }

  function handleBottomMenuOpenTerms() {
    if (screenMode === 'terms-of-service') {
      closeBottomMoreSheet();
      return;
    }

    clearSelectedPlaceRoute();

    if (screenMode === 'browse' || screenMode === 'home-feed') {
      closeBottomMoreSheet(() => navigateBrowseProfileTransition('profiles', 'terms-of-service'));
      return;
    }

    closeBottomMoreSheet(() => navigateScreen('terms-of-service', 'forward'));
  }

  function handleBottomMenuOpenPrivacy() {
    if (screenMode === 'privacy-policy') {
      closeBottomMoreSheet();
      return;
    }

    clearSelectedPlaceRoute();

    if (screenMode === 'browse' || screenMode === 'home-feed') {
      closeBottomMoreSheet(() => navigateBrowseProfileTransition('profiles', 'privacy-policy'));
      return;
    }

    closeBottomMoreSheet(() => navigateScreen('privacy-policy', 'forward'));
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

  function handleChangeProfileField(field: keyof ProfileFormState, value: ProfileFormState[keyof ProfileFormState]) {
    setProfileForm((current) => {
      if (field === 'business_city') {
        const nextCityValue = String(value);
        const servesMultipleAreas = nextCityValue === multipleAreasBusinessCityValue;
        return {
          ...current,
          business_city: nextCityValue,
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

  async function handleAddBusinessPhotoUploads() {
    try {
      const currentPhotoUrls = dedupeImageUrls(splitMultilineEntries(profileForm.photo_references_text));
      const remainingSlots = Math.max(0, 8 - currentPhotoUrls.length - businessPhotoUploads.length);

      if (remainingSlots <= 0) {
        setProfileErrorMessage('You can upload up to 8 business photos. Remove one first if you want to replace it.');
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setProfileErrorMessage('Photo library access is required to upload business photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        allowsMultipleSelection: false,
        aspect: [4, 3],
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const nextUploads = result.assets.slice(0, remainingSlots).map(normalizeBusinessPhotoUpload);
      setBusinessPhotoUploads((current) => mergeBusinessAttachments(current, nextUploads));
      setProfileErrorMessage(null);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    }
  }

  function handleRemoveCurrentBusinessPhoto(photoUrl: string) {
    setProfileForm((current) => ({
      ...current,
      photo_references_text: dedupeImageUrls(splitMultilineEntries(current.photo_references_text).filter((entry) => entry !== photoUrl)).join('\n'),
    }));
  }

  function handleRemoveBusinessPhotoUpload(attachmentId: string) {
    setBusinessPhotoUploads((current) => current.filter((attachment) => attachment.id !== attachmentId));
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

  async function handleCustomerBusinessClaimSubmitted(notice: CustomerBusinessClaimNotice) {
    dismissKeyboardForScreenTransition();
    setPendingEmailVerification(null);
    setEmailVerificationCode('');
    setAuthPortal('customer');
    setAuthMessage(null);
    setProfileErrorMessage(null);
    setProfileMessage(null);

    const customerAuthToken = authenticatedSession?.auth_token;
    if (customerAuthToken) {
      try {
        const customerSession = await fetchProfileDashboard(apiBaseUrl, customerAuthToken, 'customer');
        setAuthenticatedSessionIfCurrentToken(customerAuthToken, customerSession);
      } catch (error) {
        setProfileErrorMessage(getErrorMessage(error));
      }
    }

    setCustomerBusinessClaimNotice(notice);
    navigateScreen('profiles', 'backward');
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

    const shouldReturnToCustomerDashboard = claimReturnDestination === 'profiles' && authenticatedSession?.portal === 'customer';
    const submittedClaimNotice = shouldReturnToCustomerDashboard ? {
      businessName: selectedClaimPlace?.name ?? profileForm.business_name,
      locationLabel: selectedClaimLocation ? formatPlaceAddress(selectedClaimLocation) : (selectedClaimPlace ? formatPlaceAddress(selectedClaimPlace) : profileForm.employer_address || profileForm.business_city),
    } : null;

    try {
      const payload: BusinessSignupRequest = {
        username: profileForm.username,
        email: profileForm.email,
        password: profileForm.password,
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        attachments: businessAttachments,
        photo_uploads: businessPhotoUploads,
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
      const response = await createBusinessProfile(apiBaseUrl, payload, authenticatedSession?.auth_token);
      setProfileForm(initialProfileFormState);
      setBusinessAttachments(initialBusinessAttachments);
      setBusinessPhotoUploads([]);
      setSelectedClaimPlace(null);
      setSelectedClaimLocationId(null);
      setClaimReturnDestination('business-search');

      if (submittedClaimNotice) {
        await handleCustomerBusinessClaimSubmitted(submittedClaimNotice);
        return;
      }

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
        photo_uploads: businessPhotoUploads,
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
      setBusinessPhotoUploads([]);
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
        photo_uploads: businessPhotoUploads,
        ...buildSharedBusinessDetails(profileForm),
        business_name: profileForm.business_name,
        business_city: profileForm.business_city,
        business_venue_type: profileForm.business_venue_type,
        supporting_details: profileForm.supporting_details,
      };
      const response = await createInformalBusinessProfile(apiBaseUrl, payload);
      setProfileForm(initialProfileFormState);
      setBusinessAttachments(initialBusinessAttachments);
      setBusinessPhotoUploads([]);
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

    const currentAuthToken = authenticatedSession.auth_token;
    const currentPortal = authenticatedSession.portal;

    if (showSpinner) {
      setDashboardLoading(true);
    }
    setProfileErrorMessage(null);

    try {
      const response = await fetchProfileDashboard(apiBaseUrl, currentAuthToken, currentPortal);
      setAuthenticatedSessionIfCurrentToken(currentAuthToken, response);
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

    setSettingsSubmittingAction('two-factor-begin');
    setProfileErrorMessage(null);

    try {
      const response = await beginTwoFactorSetup(apiBaseUrl, authenticatedSession.auth_token);
      setTwoFactorSetup(response);
      setTwoFactorSetupCode('');
      setProfileMessage(response.detail);
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setSettingsSubmittingAction(null);
    }
  }

  async function handleConfirmTwoFactorSetup() {
    if (!authenticatedSession?.auth_token || !twoFactorSetup) {
      return;
    }

    const currentAuthToken = authenticatedSession.auth_token;

    setSettingsSubmittingAction('two-factor-confirm');
    setProfileErrorMessage(null);

    try {
      const response = await confirmTwoFactorSetup(apiBaseUrl, currentAuthToken, twoFactorSetupCode, authenticatedSession.portal);
      setAuthenticatedSessionIfCurrentToken(currentAuthToken, response);
      setTwoFactorSetup(null);
      setTwoFactorSetupCode('');
      setProfileMessage('Authenticator-based 2FA enabled. Use your authenticator code every time you sign in.');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setSettingsSubmittingAction(null);
    }
  }

  async function handleDisableTwoFactor() {
    if (!authenticatedSession?.auth_token) {
      return;
    }

    const currentAuthToken = authenticatedSession.auth_token;

    setSettingsSubmittingAction('two-factor-disable');
    setProfileErrorMessage(null);

    try {
      const response = await disableTwoFactor(apiBaseUrl, currentAuthToken, twoFactorDisableCode, authenticatedSession.portal);
      setAuthenticatedSessionIfCurrentToken(currentAuthToken, response);
      setTwoFactorDisableCode('');
      setTwoFactorSetup(null);
      setTwoFactorSetupCode('');
      setProfileMessage('Authenticator-based 2FA disabled.');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setSettingsSubmittingAction(null);
    }
  }

  async function handleToggleBusinessLocationTracking(enabled: boolean) {
    if (!authenticatedSession?.auth_token || authenticatedSession.portal !== 'business') {
      return;
    }

    const currentAuthToken = authenticatedSession.auth_token;
    const approvedBusinessSlugs = new Set((authenticatedSession.approved_businesses ?? []).map((business) => business.slug));

    setSettingsSubmittingAction('business-location');
    setPendingBusinessLocationTrackingEnabled(enabled);
    setProfileErrorMessage(null);

    try {
      const response = await updateBusinessLocationTrackingPreference(apiBaseUrl, currentAuthToken, { enabled });
      setAuthenticatedSessionIfCurrentToken(currentAuthToken, response);
      if (!enabled && approvedBusinessSlugs.size > 0) {
        setPlaces((current) => current.map((place) => clearTrackedCoordinatesForBusiness(place, approvedBusinessSlugs)));
        setProfilePlaces((current) => current.map((place) => clearTrackedCoordinatesForBusiness(place, approvedBusinessSlugs)));
        setSelectedPlace((current) => current ? clearTrackedCoordinatesForBusinessDetail(current, approvedBusinessSlugs) : current);
      }
      setProfileMessage(enabled
        ? 'Business location services turned on.'
        : 'Business location services turned off. Live pin updates have stopped.');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setPendingBusinessLocationTrackingEnabled(null);
      setSettingsSubmittingAction(null);
    }
  }

  async function handleToggleDirectMessaging(enabled: boolean) {
    if (!authenticatedSession?.auth_token || authenticatedSession.portal !== 'business') {
      return;
    }

    const currentAuthToken = authenticatedSession.auth_token;

    setSettingsSubmittingAction('direct-messaging');
    setPendingDirectMessagingEnabled(enabled);
    setProfileErrorMessage(null);

    try {
      const response = await updateProfileDashboard(apiBaseUrl, currentAuthToken, {
        portal: authenticatedSession.portal,
        username: authenticatedSession.username,
        email: authenticatedSession.email,
        first_name: authenticatedSession.first_name,
        last_name: authenticatedSession.last_name,
        direct_messaging_enabled: enabled,
      });
      setAuthenticatedSessionIfCurrentToken(currentAuthToken, response);
      setProfileMessage(enabled
        ? 'Direct messaging turned on.'
        : 'Direct messaging turned off for your business profile.');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setPendingDirectMessagingEnabled(null);
      setSettingsSubmittingAction(null);
    }
  }

  async function handleConfirmBlockedDirectMessageCustomers(usernames: string[]) {
    if (!authenticatedSession?.auth_token || authenticatedSession.portal !== 'business') {
      return false;
    }

    const normalizedUsernames = usernames
      .map((username) => username.trim())
      .filter(Boolean);
    if (!normalizedUsernames.length) {
      setProfileErrorMessage('Select at least one customer to block.');
      return false;
    }

    const currentAuthToken = authenticatedSession.auth_token;

    setSettingsSubmittingAction('direct-message-block');
    setProfileErrorMessage(null);

    try {
      let latestResponse: SignupResponse | null = null;
      for (const username of normalizedUsernames) {
        latestResponse = await blockBusinessDirectMessagesForCustomer(apiBaseUrl, currentAuthToken, username);
      }

      if (latestResponse) {
        setAuthenticatedSessionIfCurrentToken(currentAuthToken, latestResponse);
      }
      setProfileMessage(
        normalizedUsernames.length === 1
          ? `${normalizedUsernames[0]} was blocked from direct messages.`
          : `${normalizedUsernames.length} customers were blocked from direct messages.`,
      );
      return true;
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
      return false;
    } finally {
      setSettingsSubmittingAction(null);
    }
  }

  async function handleUnblockCustomerFromDirectMessaging(blockId: number) {
    if (!authenticatedSession?.auth_token || authenticatedSession.portal !== 'business') {
      return;
    }

    const currentAuthToken = authenticatedSession.auth_token;

    setSettingsSubmittingAction('direct-message-block');
    setProfileErrorMessage(null);

    try {
      const response = await unblockBusinessDirectMessagesForCustomer(apiBaseUrl, currentAuthToken, blockId);
      setAuthenticatedSessionIfCurrentToken(currentAuthToken, response);
      setProfileMessage('Customer unblocked from direct messages.');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setSettingsSubmittingAction(null);
    }
  }

  async function handleSaveProfileDetails(payload: ProfileDashboardUpdateRequest, photoUploads: BusinessAttachmentDraft[] = []) {
    if (!authenticatedSession?.auth_token) {
      return;
    }

    const currentAuthToken = authenticatedSession.auth_token;

    setDashboardSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = photoUploads.length
        ? await updateProfileDashboardWithUploads(apiBaseUrl, currentAuthToken, payload, photoUploads)
        : await updateProfileDashboard(apiBaseUrl, currentAuthToken, payload);
      setAuthenticatedSessionIfCurrentToken(currentAuthToken, response);
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

  function handleDeleteAccount() {
    if (!authenticatedSession?.auth_token || settingsSubmittingAction !== null) {
      return;
    }

    if (!deleteAccountPassword) {
      setProfileErrorMessage('Enter your current password to delete your account.');
      return;
    }

    void confirmDeleteAccount();
  }

  async function confirmDeleteAccount() {
    if (!authenticatedSession?.auth_token) {
      return;
    }

    setSettingsSubmittingAction('delete-account');
    setProfileErrorMessage(null);

    try {
      const response = await deleteProfileAccount(apiBaseUrl, authenticatedSession.auth_token, deleteAccountPassword);
      setProfileMessage(null);
      setProfileErrorMessage(null);
      setAuthMessage(response.detail || 'Your account has been permanently deleted.');
      setShouldAutoFocusLoginField(false);
      setDeleteAccountPassword('');
      setTwoFactorSetup(null);
      setTwoFactorSetupCode('');
      setTwoFactorDisableCode('');
      startLogoutTransition();
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setSettingsSubmittingAction(null);
    }
  }

  function handleLogout() {
    setProfileMessage(null);
    setProfileErrorMessage(null);
    setAuthMessage('You have been signed out.');
    setShouldAutoFocusLoginField(false);
    setDeleteAccountPassword('');
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
    setClaimReturnDestination('business-search');
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

    if (claimReturnDestination === 'browse-map') {
      resetDirectClaimState();
      handleBrowseModeChange('map');
      setScreenMode('browse');
      return;
    }

    if (claimReturnDestination === 'profiles') {
      resetDirectClaimState();
      setScreenMode('profiles');
      setProfileEntryOffset(0);
      profileSceneTransition.stopAnimation();
      profileSceneTransition.setValue(0);
      Animated.timing(profileSceneTransition, {
        duration: 220,
        toValue: 1,
        useNativeDriver: true,
      }).start();
      return;
    }

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
    setBusinessPhotoUploads([]);
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
    setBusinessPhotoUploads([]);
    setProfileForm((current) => resetBusinessVerificationFields(current));
    navigateScreen('informal-business-claim', 'forward');
  }

  function handleSelectClaimBusiness(place: PlaceListItem, locationId: number) {
    dismissKeyboardForScreenTransition();
    const selectedLocation = getPlaceLocations(place).find((location) => location.id === locationId) ?? getPlaceLocations(place)[0] ?? place;
    claimPrefillLoadedKeyRef.current = '';
    setClaimReturnDestination('business-search');
    setSelectedClaimPlace(place);
    setSelectedClaimLocationId(selectedLocation.id);
    setBusinessAttachments(initialBusinessAttachments);
    setBusinessPhotoUploads([]);
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
    setSelectedMapSearchPreviewPlace(null);
  }

  function handleSelectMapPin(placeKey: string) {
    invalidateMapResultsCardTransitions();
    mapResultsOpacity.stopAnimation();
    mapResultsOpacity.setValue(1);
    setShowMapResultsCard(false);
    setSelectedMapSearchPreviewPlace(null);
    setSelectedMapPlaceKey(placeKey);
  }

  function handleFocusMapResult(place: MapSearchResultPlace) {
    invalidateMapResultsCardTransitions();
    mapResultsOpacity.stopAnimation();
    mapResultsOpacity.setValue(0);
    setShowMapResultsCard(false);

    if (!place.markerKey || place.latitude === null || place.longitude === null) {
      const nextRegion = clampRegionToBounds(defaultMapRegion);
      setSelectedMapPlaceKey(null);
      setSelectedMapSearchPreviewPlace(place);
      mapRegionRef.current = nextRegion;
      setMapRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 250);
      return;
    }

    setSelectedMapSearchPreviewPlace(null);
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

    if (targetScreen === 'favorite-businesses' && profileSession?.profile_type !== 'business') {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <FavoriteBusinessesScreen
            isLandscape={isLandscape}
            onBack={handleBackFromFavoriteBusinesses}
            onOpenFavoriteBusiness={handleOpenFavoriteBusiness}
            session={profileSession!}
          />
        </SafeAreaView>
      );
    }

    if (targetScreen === 'business-notifications' && profileSession?.profile_type !== 'business') {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <FavoriteBusinessNotificationsScreen
            errorMessage={profileErrorMessage}
            isLandscape={isLandscape}
            message={profileMessage}
            onBack={handleBackFromBusinessNotifications}
            onClear={() => void handleClearFavoriteBusinessNotifications()}
            onClearNotification={(notificationId) => void handleClearFavoriteBusinessNotification(notificationId)}
            onOpenFavoriteBusiness={handleOpenFavoriteBusiness}
            session={profileSession!}
            submitting={dashboardSubmitting}
          />
        </SafeAreaView>
      );
    }

    if (targetScreen === 'support' && profileSession) {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <ContactSupportScreen
            errorMessage={profileErrorMessage}
            initialMessage={supportDraftContext?.message}
            initialSubject={supportDraftContext?.subject}
            isLandscape={isLandscape}
            message={profileMessage}
            onBack={handleBackFromSupport}
            onSubmit={(subject, message) => void handleSubmitSupportRequest(subject, message)}
            session={profileSession}
            submitting={profileSubmitting}
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

    if (targetScreen === 'blocked-direct-message-customers' && profileSession?.profile_type === 'business') {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <BlockedDirectMessageCustomersScreen
            errorMessage={profileErrorMessage}
            isLandscape={isLandscape}
            message={profileMessage}
            onBack={handleBackToSettings}
            onConfirmBlockedDirectMessageCustomers={handleConfirmBlockedDirectMessageCustomers}
            onLoadExistingDirectMessageCustomers={handleRefreshDirectMessageThreads}
            onUnblockCustomerFromDirectMessaging={(blockId) => void handleUnblockCustomerFromDirectMessaging(blockId)}
            session={profileSession}
            settingsSubmittingAction={settingsSubmittingAction}
          />
        </SafeAreaView>
      );
    }

    if (targetScreen === 'settings' && profileSession) {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <AccountSettingsScreen
            deleteAccountPassword={deleteAccountPassword}
            errorMessage={profileErrorMessage}
            isLandscape={isLandscape}
            message={profileMessage}
            onBack={handleBackFromSettings}
            onBeginTwoFactorSetup={() => void handleBeginTwoFactorSetup()}
            onChangeDeleteAccountPassword={setDeleteAccountPassword}
            onChangeTwoFactorDisableCode={setTwoFactorDisableCode}
            onChangeTwoFactorSetupCode={setTwoFactorSetupCode}
            onConfirmTwoFactorSetup={() => void handleConfirmTwoFactorSetup()}
            onDisableTwoFactor={() => void handleDisableTwoFactor()}
            onDeleteAccount={handleDeleteAccount}
            onLogout={handleLogout}
            onToggleBusinessLocationTracking={(value) => void handleToggleBusinessLocationTracking(value)}
            onOpenBlockedDirectMessageCustomers={handleOpenBlockedDirectMessageCustomers}
            onOpenContactSupport={handleOpenSupport}
            onOpenPrivacyPolicy={handleOpenPrivacyPolicy}
            onOpenTermsOfService={handleOpenTermsOfService}
            onToggleDirectMessaging={(value) => void handleToggleDirectMessaging(value)}
            pendingBusinessLocationTrackingEnabled={pendingBusinessLocationTrackingEnabled}
            pendingDirectMessagingEnabled={pendingDirectMessagingEnabled}
            session={profileSession}
            settingsSubmittingAction={settingsSubmittingAction}
            twoFactorDisableCode={twoFactorDisableCode}
            twoFactorSetup={twoFactorSetup}
            twoFactorSetupCode={twoFactorSetupCode}
          />
        </SafeAreaView>
      );
    }

    if (targetScreen === 'business-profile-editor' && profileSession?.profile_type === 'business') {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <BusinessProfileEditorScreen
            errorMessage={profileErrorMessage}
            isLandscape={isLandscape}
            message={profileMessage}
            onBack={handleBackFromBusinessProfileEditor}
            onSaveProfileDetails={(payload, photoUploads) => void handleSaveProfileDetails(payload, photoUploads)}
            onViewInMap={handleViewApprovedBusinessInMap}
            session={profileSession}
            submitting={dashboardSubmitting}
          />
        </SafeAreaView>
      );
    }

    if (targetScreen === 'direct-messages' && profileSession) {
      return (
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <DirectMessagesScreen
            backButtonLabel={selectedPlaceSlug ? 'Back to Profile' : 'Back'}
            contextBusinessName={selectedPlace?.name ?? null}
            contextListingSlug={selectedPlaceSlug}
            isLandscape={isLandscape}
            onBack={handleBackFromDirectMessages}
            onBlockCustomerFromDirectMessaging={(customerUsername) => void handleBlockCustomerFromDirectMessages(customerUsername)}
            onDeleteConversation={(threadId) => void handleDeleteDirectMessageConversation(threadId)}
            onLoadThreadDetail={handleLoadDirectMessageThreadDetail}
            onRefreshThreads={handleRefreshDirectMessageThreads}
            onSendImageMessage={handleSendImageDirectMessage}
            onSendTextMessage={handleSendTextDirectMessage}
            onUnblockCustomerFromDirectMessaging={(blockId) => void handleUnblockCustomerFromDirectMessaging(blockId)}
            session={profileSession}
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
            onOpenApprovedBusiness={handleOpenFavoriteBusiness}
            onOpenBusinessProfileEditor={handleOpenBusinessProfileEditorFromDashboard}
            onOpenFavoriteBusiness={handleOpenFavoriteBusiness}
            onOpenFavoriteBusinesses={handleOpenFavoriteBusinesses}
            onOpenBusinessNotifications={handleOpenBusinessNotifications}
            onOpenDirectMessages={openDirectMessagesScreen}
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

  function renderAuthenticatedHomeFeedScreen() {
    return (
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <HomeFeedScreen
          apiBaseUrl={apiBaseUrl}
          headerContent={<View style={{ height: Math.max(insets.top + 10, 22) }} />}
          headerHorizontalPadding={18}
          refreshProgressViewOffset={Math.max(insets.top + 42, 64)}
          footerContent={<View style={{ height: bottomNavHeight + 16 }} />}
          isLandscape={isLandscape}
          reloadToken={reloadCount}
          searchQuery=""
          selectedCity="all"
          selectedVenueTypes={venueFilters.map((filter) => filter.value)}
        />
      </SafeAreaView>
    );
  }

  function renderBottomNavIcon(icon: MainShellBottomNavItem, active: boolean) {
    switch (icon) {
      case 'home':
        return (
          <View style={styles.bottomNavFeedIcon}>
            <View style={[styles.bottomNavFeedFrame, active ? styles.bottomNavFeedFrameActive : null]} />
            <View style={[styles.bottomNavFeedLine, styles.bottomNavFeedLineTop, active ? styles.bottomNavIconStrokeActive : null]} />
            <View style={[styles.bottomNavFeedLine, styles.bottomNavFeedLineBottom, active ? styles.bottomNavIconStrokeActive : null]} />
          </View>
        );
      case 'map':
        return (
          <View style={styles.bottomNavMapIcon}>
            <View style={[styles.bottomNavMapPanel, active ? styles.bottomNavMapPanelActive : null]} />
            <View style={[styles.bottomNavMapPanel, styles.bottomNavMapPanelMiddle, active ? styles.bottomNavMapPanelActive : null]} />
            <View style={[styles.bottomNavMapPanel, active ? styles.bottomNavMapPanelActive : null]} />
          </View>
        );
      case 'profile':
        return (
          <View style={styles.bottomNavProfileIcon}>
            <View style={[styles.bottomNavProfileHead, active ? styles.bottomNavIconFillActive : null]} />
            <View style={[styles.bottomNavProfileBody, active ? styles.bottomNavIconStrokeActive : null]} />
          </View>
        );
      case 'more':
        return (
          <View style={styles.bottomNavMoreIcon}>
            <View style={[styles.bottomNavMoreLine, active ? styles.bottomNavIconStrokeActive : null]} />
            <View style={[styles.bottomNavMoreLine, active ? styles.bottomNavIconStrokeActive : null]} />
            <View style={[styles.bottomNavMoreLine, active ? styles.bottomNavIconStrokeActive : null]} />
          </View>
        );
      default:
        return null;
    }
  }

  function handleBottomNavSelection(item: MainShellBottomNavItem) {
    switch (item) {
      case 'home':
        handleBottomNavOpenHomeFeed();
        break;
      case 'map':
        handleBottomNavOpenMap();
        break;
      case 'profile':
        handleBottomNavOpenProfile();
        break;
      case 'more':
        handleBottomNavOpenMore();
        break;
      default:
        break;
    }
  }

  function renderBottomNav(options: { guest: boolean }) {
    let activeItem: MainShellBottomNavItem = 'map';
    if (!options.guest) {
      if (screenMode === 'home-feed') {
        activeItem = 'home';
      } else if (['settings', 'blocked-direct-message-customers', 'support', 'privacy-policy', 'terms-of-service', 'favorite-businesses', 'business-notifications'].includes(screenMode)) {
        activeItem = 'more';
      } else if (screenMode !== 'browse') {
        activeItem = 'profile';
      }
    }

    if (isNativeIOSLiquidGlassBottomNavAvailable()) {
      return (
        <View pointerEvents="box-none" style={styles.bottomNavOverlay}>
          <View
            pointerEvents="none"
            style={[
              styles.bottomNavNativeBackdrop,
              { height: Math.max(56, insets.bottom + 56) },
            ]}
          />
          <NativeIOSLiquidGlassBottomNav
            activeItem={activeItem}
            bottomInset={insets.bottom}
            includeHomeItem={!options.guest}
            labels={options.guest ? undefined : { home: 'Feed' }}
            moreOpen={bottomMoreSheetVisible}
            onSelect={handleBottomNavSelection}
            style={{ width: '100%' }}
            systemImages={options.guest ? undefined : { home: 'newspaper' }}
          />
        </View>
      );
    }

    return (
      <View pointerEvents="box-none" style={styles.bottomNavOverlay}>
        <View style={[styles.bottomNavShell, { paddingBottom: Math.max(insets.bottom + 10, 14) }]}>
          <View pointerEvents="none" style={styles.bottomNavGlassHighlight} />
          {!options.guest ? (
            <Pressable accessibilityLabel="Open home feed" onPress={handleBottomNavOpenHomeFeed} style={styles.bottomNavItem}>
              <View style={[styles.bottomNavItemIconWrap, activeItem === 'home' ? styles.bottomNavItemIconWrapActive : null]}>
                {renderBottomNavIcon('home', activeItem === 'home')}
              </View>
              <Text style={[styles.bottomNavItemLabel, activeItem === 'home' ? styles.bottomNavItemLabelActive : null]}>Feed</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityLabel="Open map" onPress={handleBottomNavOpenMap} style={styles.bottomNavItem}>
            <View style={[styles.bottomNavItemIconWrap, activeItem === 'map' ? styles.bottomNavItemIconWrapActive : null]}>
              {renderBottomNavIcon('map', activeItem === 'map')}
            </View>
            <Text style={[styles.bottomNavItemLabel, activeItem === 'map' ? styles.bottomNavItemLabelActive : null]}>Map</Text>
          </Pressable>
          <Pressable accessibilityLabel="Open profile" onPress={handleBottomNavOpenProfile} style={styles.bottomNavItem}>
            <View style={[styles.bottomNavItemIconWrap, activeItem === 'profile' ? styles.bottomNavItemIconWrapActive : null]}>
              {renderBottomNavIcon('profile', activeItem === 'profile')}
            </View>
            <Text style={[styles.bottomNavItemLabel, activeItem === 'profile' ? styles.bottomNavItemLabelActive : null]}>Profile</Text>
          </Pressable>
          <Pressable accessibilityLabel="Open more menu" hitSlop={12} onPress={handleBottomNavOpenMore} pressRetentionOffset={12} style={styles.bottomNavItem}>
            <View style={[styles.bottomNavItemIconWrap, activeItem === 'more' || bottomMoreSheetVisible ? styles.bottomNavItemIconWrapActive : null]}>
              {renderBottomNavIcon('more', activeItem === 'more' || bottomMoreSheetVisible)}
            </View>
            <Text style={[styles.bottomNavItemLabel, activeItem === 'more' || bottomMoreSheetVisible ? styles.bottomNavItemLabelActive : null]}>More</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderGuestMainShell() {
    const browseTransitionActive = usesGuestBrowseSlideTransition;
    const currentOverlayScreen = currentOnboardingScreen && currentOnboardingScreen !== 'splash'
      ? currentOnboardingScreen
      : null;
    const overlayScreen = returningToSplashScreen ?? currentOverlayScreen;
    const showingBrowse = screenMode === 'browse';
    const splashLayerStyle = browseTransitionActive
      ? guestBrowseTransitionFrom === 'splash'
        ? guestBrowseOutgoingStyle
        : guestBrowseIncomingStyle
      : showingBrowse
        ? { opacity: 0, transform: [{ translateX: width }] }
        : null;
    const browseLayerStyle = browseTransitionActive
      ? guestBrowseTransitionFrom === 'browse'
        ? guestBrowseOutgoingStyle
        : guestBrowseIncomingStyle
      : showingBrowse
        ? null
        : { opacity: 0, transform: [{ translateX: -width }] };
    const currentOverlayStyle = returningToSplashScreen
      ? splashReturnOutgoingStyle
      : incomingOnboardingScreen && currentOverlayScreen
        ? currentOnboardingTransitionStyle
        : null;

    return (
      <View style={[styles.fullScreenRoot, (browseTransitionActive || incomingOnboardingScreen || returningToSplashScreen) ? styles.transitionClipRoot : null]}>
        <Animated.View
          pointerEvents={!showingBrowse && !browseTransitionActive && !overlayScreen && !incomingOnboardingScreen ? 'auto' : 'none'}
          style={[styles.screenTransitionLayerAbsolute, splashLayerStyle]}
        >
          {renderOnboardingScreen('splash')}
        </Animated.View>
        <Animated.View
          pointerEvents={showingBrowse && !browseTransitionActive ? 'auto' : 'none'}
          style={[
            styles.screenTransitionLayerAbsolute,
            !browseTransitionActive && showingBrowse && shellFadeScope === 'browse' ? browseSceneTransitionStyle : null,
            browseLayerStyle,
          ]}
        >
          {renderBrowseScreen({
            guestBottomNav: true,
            includeBottomNav: true,
            suppressBrowseSceneTransitionStyle: true,
            suppressScreenTransitionStyle: true,
            suppressTransitionOverlay: true,
          })}
        </Animated.View>
        {!browseTransitionActive && showingBrowse && shellFadeScope === 'browse' ? (
          <Animated.View pointerEvents="none" style={[styles.screenTransitionLayerAbsolute, browseShellFadeMaskStyle]} />
        ) : null}
        {overlayScreen ? (
          <Animated.View
            pointerEvents={incomingOnboardingScreen || returningToSplashScreen ? 'none' : 'auto'}
            style={[
              styles.screenTransitionLayerAbsolute,
              authIntroStyle && overlayScreen === 'auth' && !incomingOnboardingScreen && !returningToSplashScreen ? authIntroStyle : null,
              currentOverlayStyle,
            ]}
          >
            {renderOnboardingScreen(overlayScreen)}
          </Animated.View>
        ) : null}
        {incomingOnboardingScreen && incomingOnboardingScreen !== 'splash' ? (
          <Animated.View style={[styles.screenTransitionLayerAbsolute, styles.incomingOnboardingOverlay, incomingScreenTransitionStyle]}>
            {renderOnboardingScreen(incomingOnboardingScreen)}
          </Animated.View>
        ) : null}
      </View>
    );
  }

  function renderAuthenticatedMainShell() {
    const profileStackTransitionActive = usesProfileStackSlideTransition
      && currentOnboardingScreen !== null
      && incomingOnboardingScreen !== null
      && profileStackTransitionScreens.has(currentOnboardingScreen)
      && profileStackTransitionScreens.has(incomingOnboardingScreen);
    const transitionActive = usesBrowseProfileSlideTransition || profileStackTransitionActive;
    const showingProfile = ['profiles', 'favorite-businesses', 'business-notifications', 'business-profile-editor', 'settings', 'blocked-direct-message-customers', 'support', 'privacy-policy', 'terms-of-service', 'direct-messages'].includes(screenMode);
    const incomingBrowseScreen = transitionActive && incomingBrowseProfileScreen === 'browse'
      ? incomingBrowseProfileTargetScreen ?? 'browse'
      : null;
    const incomingProfileScreen = transitionActive && incomingBrowseProfileScreen === 'profiles'
      ? incomingBrowseProfileTargetScreen ?? 'profiles'
      : undefined;
    const profileStackIncomingScreen = profileStackTransitionActive ? incomingOnboardingScreen : null;
    const profileLayerStyle = usesBrowseProfileSlideTransition
      ? browseProfileTransitionFrom === 'profiles'
        ? browseProfileOutgoingStyle
        : browseProfileIncomingStyle
      : showingProfile
        ? profileSceneTransitionStyle
        : { opacity: 0, transform: [{ translateX: width }] };
    const browseLayerStyle = usesBrowseProfileSlideTransition
      ? browseProfileTransitionFrom === 'browse'
        ? browseProfileOutgoingStyle
        : browseProfileIncomingStyle
      : showingProfile
        ? { opacity: 0, transform: [{ translateX: -width }] }
        : null;
    const profileLayerContent = renderProfilesScreen(undefined, incomingProfileScreen);
    const browseLayerContent = (incomingBrowseScreen ?? screenMode) === 'home-feed'
      ? renderAuthenticatedHomeFeedScreen()
      : renderBrowseScreen({
          guestBottomNav: false,
          suppressBrowseSceneTransitionStyle: true,
          suppressScreenTransitionStyle: true,
          suppressTransitionOverlay: true,
        });

    return (
      <View style={[styles.fullScreenRoot, transitionActive ? styles.transitionClipRoot : null]}>
        <Animated.View
          pointerEvents={showingProfile && !transitionActive ? 'auto' : 'none'}
          style={[styles.screenTransitionLayerAbsolute, profileLayerStyle, profileStackTransitionActive ? currentOnboardingTransitionStyle : null]}
        >
          {profileLayerContent}
        </Animated.View>
        {profileStackIncomingScreen ? (
          <Animated.View style={[styles.screenTransitionLayerAbsolute, styles.incomingOnboardingOverlay, incomingScreenTransitionStyle]}>
            {renderProfilesScreen(undefined, profileStackIncomingScreen)}
          </Animated.View>
        ) : null}
        <Animated.View
          pointerEvents={!showingProfile && !transitionActive ? 'auto' : 'none'}
          style={[
            styles.screenTransitionLayerAbsolute,
            !transitionActive && !showingProfile && shellFadeScope === 'browse' ? browseSceneTransitionStyle : null,
            browseLayerStyle,
          ]}
        >
          {browseLayerContent}
        </Animated.View>
        {!transitionActive && !showingProfile && shellFadeScope === 'browse' ? (
          <Animated.View pointerEvents="none" style={[styles.screenTransitionLayerAbsolute, browseShellFadeMaskStyle]} />
        ) : null}
        {renderBottomNav({ guest: false })}
      </View>
    );
  }

  function renderOnboardingScreen(targetScreen: AppScreenMode, profileSessionOverride?: SignupResponse | null) {
    switch (targetScreen) {
      case 'splash':
        return (
          <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
            <SplashScreen apiBaseUrl={apiBaseUrl} onCreateAccount={handleOpenProfiles} onOpenMap={handleOpenMapFromSplash} onSelectPortal={handleOpenAuthFromLanding} />
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
      case 'favorite-businesses':
        return renderProfilesScreen(profileSessionOverride, 'favorite-businesses');
      case 'business-notifications':
        return renderProfilesScreen(profileSessionOverride, 'business-notifications');
      case 'business-profile-editor':
        return renderProfilesScreen(profileSessionOverride, 'business-profile-editor');
      case 'settings':
        return renderProfilesScreen(profileSessionOverride, 'settings');
      case 'blocked-direct-message-customers':
        return renderProfilesScreen(profileSessionOverride, 'blocked-direct-message-customers');
      case 'support':
        return renderProfilesScreen(profileSessionOverride, 'support');
      case 'privacy-policy':
        return renderProfilesScreen(profileSessionOverride, 'privacy-policy');
      case 'terms-of-service':
        return renderProfilesScreen(profileSessionOverride, 'terms-of-service');
      case 'direct-messages':
        return renderProfilesScreen(profileSessionOverride, 'direct-messages');
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
              lockAccountIdentityFields={claimReturnDestination === 'profiles' && authenticatedSession?.portal === 'customer'}
              mode="claimed"
              onAddAttachments={handleAddBusinessAttachments}
              onAddPhotoUploads={handleAddBusinessPhotoUploads}
              onBack={handleBackToBusinessSearch}
              onChangeField={handleChangeProfileField}
              onRemoveCurrentPhoto={handleRemoveCurrentBusinessPhoto}
              onRemoveAttachment={handleRemoveBusinessAttachment}
              onRemovePhotoUpload={handleRemoveBusinessPhotoUpload}
              onToggleAddressNotApplicable={(value) => handleChangeProfileToggle('address_not_applicable', value)}
              onSubmit={handleSubmitClaimedBusinessProfile}
              photoUploads={businessPhotoUploads}
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
              onAddPhotoUploads={handleAddBusinessPhotoUploads}
              onBack={handleBackToBusinessSearch}
              onChangeField={handleChangeProfileField}
              onRemoveCurrentPhoto={handleRemoveCurrentBusinessPhoto}
              onRemoveAttachment={handleRemoveBusinessAttachment}
              onRemovePhotoUpload={handleRemoveBusinessPhotoUpload}
              onToggleAddressNotApplicable={(value) => handleChangeProfileToggle('address_not_applicable', value)}
              onSubmit={handleSubmitManualBusinessProfile}
              photoUploads={businessPhotoUploads}
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
              onAddPhotoUploads={handleAddBusinessPhotoUploads}
              onBack={handleBackToBusinessSearch}
              onChangeField={handleChangeProfileField}
              onRemoveCurrentPhoto={handleRemoveCurrentBusinessPhoto}
              onRemoveAttachment={handleRemoveBusinessAttachment}
              onRemovePhotoUpload={handleRemoveBusinessPhotoUpload}
              onToggleAddressNotApplicable={(value) => handleChangeProfileToggle('address_not_applicable', value)}
              onSubmit={handleSubmitInformalBusinessProfile}
              photoUploads={businessPhotoUploads}
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

  function renderBrowseScreen(options?: {
    guestBottomNav?: boolean;
    includeBottomNav?: boolean;
    suppressScreenTransitionStyle?: boolean;
    suppressBrowseSceneTransitionStyle?: boolean;
    suppressTransitionOverlay?: boolean;
  }) {
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
                    const isGesture = !!details?.isGesture;
                    const normalizedRegion = normalizeRegion(nextRegion);
                    const boundedRegion = shouldUseNativeMapBoundaries
                      ? normalizedRegion
                      : clampRegionToBounds(normalizedRegion);

                    if (isGesture) {
                      clearAutoFitMapRegionTimer();
                    }

                    if (isGesture) {
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
                  overlay={browseMode === 'map'}
                  filtersExpanded={browseFiltersExpanded}
                  informalBusinessesOnly={informalBusinessesOnly}
                  isDarkMapMode={darkMapMode}
                  listModeEnabled={!guestMapOnlyMode}
                  onChangeSearchQuery={handleChangeSearchQuery}
                  onClearSearchQuery={handleClearSearchQuery}
                  onBrowseModeChange={handleBrowseModeChange}
                  onOpenDashboard={authenticatedSession && browseMode === 'list' ? handleOpenProfiles : undefined}
                  onReload={handleRefreshPlaces}
                  onSelectAllVenueTypes={handleSelectAllVenueTypes}
                  onSelectCity={setSelectedCity}
                  onToggleSearchPanelLift={browseMode === 'map' ? handleToggleMapSearchPanelLift : undefined}
                  onToggleConfirmedDealsOnly={handleToggleConfirmedDealsOnly}
                  onToggleDealDay={handleToggleDealDay}
                  onToggleFilters={handleToggleBrowseFilters}
                  onToggleInformalBusinessesOnly={handleToggleInformalBusinessesOnly}
                  onToggleMapTheme={browseMode === 'map' ? handleToggleMapTheme : undefined}
                  onToggleOperatingDay={handleToggleOperatingDay}
                  onToggleVenueType={handleToggleVenueType}
                  onToggleVerifiedBusinessesOnly={handleToggleVerifiedBusinessesOnly}
                  resultCount={browseResultCount}
                  searchPanelLifted={browseMode === 'map' ? mapSearchPanelLifted : false}
                  searchQuery={searchQuery}
                  selectedDealDays={selectedDealDays}
                  selectedCity={selectedCity}
                  selectedOperatingDays={selectedOperatingDays}
                  selectedVenueTypes={selectedVenueTypes}
                  verifiedBusinessesOnly={verifiedBusinessesOnly}
                />

                <View style={styles.browseContentStage}>
                  <Animated.View
                    pointerEvents={browseMode === 'map' ? 'box-none' : 'none'}
                    style={[
                      styles.browseContentFill,
                      styles.mapOverlayContentLayer,
                      browseModeTransitionStyle,
                      { paddingBottom: mapOverlayBottomPadding },
                    ]}
                  >
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
                          {displayedMapPreviewPlace.latitude === null || displayedMapPreviewPlace.longitude === null ? (
                            <Text style={[styles.mapPreviewDetailText, isLandscape ? styles.mapPreviewDetailTextLandscape : null]}>Map pin unavailable right now.</Text>
                          ) : null}
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
                            {displayedMapPreviewImageUrls.map((imageUrl, index) => (
                              <Pressable key={imageUrl} onPress={() => handleOpenMapPreviewPhotoLightbox(index)}>
                                <Image
                                  source={{ uri: imageUrl }}
                                  style={[styles.mapPreviewImage, isLandscape ? styles.mapPreviewImageLandscape : null]}
                                />
                              </Pressable>
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
                                  key={place.resultKey}
                                  onPress={() => handleFocusMapResult(place)}
                                  style={styles.mapResultRow}
                                >
                                  <View style={styles.mapResultCopy}>
                                    <Text numberOfLines={1} style={styles.mapResultTitle}>{place.name}</Text>
                                    <Text numberOfLines={2} style={styles.mapResultMeta}>
                                      {place.venue_type_label} • {place.fullAddress}{place.markerKey ? '' : ' • No map pin yet'}
                                    </Text>
                                  </View>
                                  <Text style={styles.mapResultAction}>{place.markerKey ? 'Focus' : 'Preview'}</Text>
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
                      <BrowsePlaceList
                        browseListColumns={browseListColumns}
                        displayedBrowsePlaces={displayedBrowsePlaces}
                        listRevealEnabled={listRevealEnabled}
                        listRevealToken={listRevealToken}
                        normalizedSearchQuery={normalizedSearchQuery}
                        onSelectPlace={handleSelectPlace}
                        userCoordinates={userCoordinates}
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
                  <NativeIOSLiquidGlassHeaderButton
                    accessibilityLabel="Back to dashboard"
                    fallback={(
                      <Pressable
                        accessibilityLabel="Back to dashboard"
                        onPress={handleBottomNavOpenProfile}
                        style={[
                          styles.floatingDashboardButton,
                          styles.floatingDashboardButtonMap,
                          styles.floatingMapNavActionButton,
                          { bottom: floatingDashboardButtonOffset, right: 14 },
                        ]}
                      >
                        <Text style={styles.floatingMapNavActionArrow}>→</Text>
                      </Pressable>
                    )}
                    onPress={handleBottomNavOpenProfile}
                    style={{ bottom: floatingDashboardButtonOffset, height: 54, position: 'absolute', right: 14, width: 54, zIndex: 40 }}
                    systemImage="arrow.right"
                    variant="icon"
                  />
                ) : guestMapOnlyMode && browseMode === 'map' ? (
                  <NativeIOSLiquidGlassHeaderButton
                    accessibilityLabel="Exit guest map"
                    fallback={(
                      <Pressable
                        accessibilityLabel="Exit guest map"
                        onPress={handleExitGuestMap}
                        style={[
                          styles.floatingDashboardButton,
                          styles.floatingDashboardButtonMap,
                          styles.floatingGuestExitButton,
                          { bottom: floatingDashboardButtonOffset, right: 14 },
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
                    )}
                    onPress={handleExitGuestMap}
                    style={{ bottom: floatingDashboardButtonOffset, height: 54, position: 'absolute', right: 14, width: 54, zIndex: 40 }}
                    systemImage="rectangle.portrait.and.arrow.right"
                    variant="icon"
                  />
                ) : null}
                {options?.includeBottomNav ? renderBottomNav({ guest: options.guestBottomNav ?? false }) : null}
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
            <View style={styles.fullScreenRoot}>
              {renderOnboardingScreen('profiles')}
              {!shouldAnimateLoginSuccessBottomNav ? renderBottomNav({ guest: false }) : null}
            </View>
          </Animated.View>
          {shouldAnimateLoginSuccessBottomNav ? (
            <Animated.View pointerEvents="none" style={[styles.bottomNavLoginTransitionLayer, loginSuccessBottomNavStyle]}>
              {renderBottomNav({ guest: false })}
            </Animated.View>
          ) : null}
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
      ) : authenticatedSession && (screenMode === 'direct-messages' || (!selectedPlaceSlug && (['profiles', 'favorite-businesses', 'business-notifications', 'business-profile-editor', 'settings', 'blocked-direct-message-customers', 'support', 'privacy-policy', 'terms-of-service', 'browse', 'home-feed'].includes(screenMode) || usesBrowseProfileSlideTransition || usesProfileStackSlideTransition))) ? (
        renderAuthenticatedMainShell()
      ) : !authenticatedSession && !selectedPlaceSlug && (screenMode === 'browse' || currentOnboardingScreen !== null || usesGuestBrowseSlideTransition || incomingOnboardingScreen !== null || returningToSplashScreen !== null) ? (
        renderGuestMainShell()
      ) : selectedPlaceSlug ? (
        <Animated.View style={[styles.fullScreenRoot, selectedPlaceReturnFadeActive ? { opacity: selectedPlaceReturnFade } : null]}>
          <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
            <PlaceDetailScreen
              backButtonLabel={screenMode === 'profiles' || screenMode === 'business-profile-editor' ? 'Back to Profile' : 'Back to Places'}
              canSubmitPlaceAccuracyReport={!!authenticatedSession?.auth_token}
              detailLoading={detailLoading}
              errorMessage={errorMessage}
              favoriteHelperText={favoriteHelperText}
              favoriteSubmitting={favoriteSubmitting}
              isLandscape={isLandscape}
              isFavorited={selectedPlaceIsFavorited}
              onBack={handleBackToBrowse}
              onClaimBusiness={handleOpenBusinessClaimFromPlaceDetail}
              onEditBusinessProfile={handleOpenBusinessProfileEditor}
              onOpenDirectMessages={openDirectMessagesScreen}
              onRequirePlaceAccuracyAccount={() => setShowGuestAccuracyPrompt(true)}
              onSelectLocation={setSelectedLocationId}
              onSubmitPlaceAccuracyReport={(subject, message) => handleSubmitPlaceAccuracyReport(subject, message)}
              onToggleFavorite={() => void handleToggleFavoriteBusiness()}
              showClaimBusinessControl={showClaimBusinessControl}
              showDirectMessageControl={!!authenticatedSession}
              showEditBusinessProfileControl={selectedPlaceIsOwnedByAuthenticatedBusiness}
              showFavoriteControl={showFavoriteControl}
              distanceLabel={selectedPlaceDistanceLabel}
              selectedPlace={selectedPlace}
              selectedPlaceDeals={selectedPlaceDeals}
              selectedPlaceLocation={selectedPlaceLocation}
              selectedPlaceOperatingHours={selectedPlaceOperatingHours}
            />
          </SafeAreaView>
          {authenticatedSession ? renderBottomNav({ guest: false }) : null}
        </Animated.View>
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
        animationType="none"
        onRequestClose={() => closeBottomMoreSheet()}
        transparent
        visible={bottomMoreSheetVisible}
      >
        <View style={styles.bottomSheetBackdrop}>
          <Animated.View pointerEvents="box-none" style={[styles.bottomSheetBackdropOverlay, { opacity: bottomMoreSheetProgress }]}> 
            <Pressable onPress={() => closeBottomMoreSheet()} style={styles.bottomSheetBackdropPressable} />
          </Animated.View>
          <PanGestureHandler
            activeOffsetY={8}
            failOffsetX={[-16, 16]}
            onGestureEvent={handleBottomMoreSheetGestureEvent}
            onHandlerStateChange={handleBottomMoreSheetStateChange}
          >
            <Animated.View
              style={[
                styles.bottomSheetCard,
                {
                  opacity: bottomMoreSheetProgress,
                  transform: [{
                    translateY: bottomMoreSheetTranslateY,
                  }],
                },
              ]}
            >
              <View style={styles.bottomSheetDragZone}>
                <View style={styles.bottomSheetHandle} />
                <Text style={styles.bottomSheetTitle}>More</Text>
              </View>
              {authenticatedSession?.profile_type !== 'business' ? (
                <>
                  <Pressable onPress={handleBottomMenuOpenFavoriteBusinesses} style={styles.bottomSheetActionButton}>
                    <Text style={styles.bottomSheetActionText}>Favorite Businesses</Text>
                  </Pressable>
                  <Pressable onPress={handleBottomMenuOpenBusinessNotifications} style={styles.bottomSheetActionButton}>
                    <Text style={styles.bottomSheetActionText}>Business Notifications</Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable onPress={handleBottomMenuOpenSettings} style={styles.bottomSheetActionButton}>
                <Text style={styles.bottomSheetActionText}>Settings</Text>
              </Pressable>
              <Pressable onPress={handleBottomMenuOpenSupport} style={styles.bottomSheetActionButton}>
                <Text style={styles.bottomSheetActionText}>Contact Support</Text>
              </Pressable>
              <Pressable onPress={handleBottomMenuOpenTerms} style={styles.bottomSheetActionButton}>
                <Text style={styles.bottomSheetActionText}>Terms of Service and Agreements</Text>
              </Pressable>
              <Pressable onPress={handleBottomMenuOpenPrivacy} style={styles.bottomSheetActionButton}>
                <Text style={styles.bottomSheetActionText}>Privacy Policy</Text>
              </Pressable>
              <Pressable onPress={() => closeBottomMoreSheet(() => handleLogout())} style={[styles.bottomSheetActionButton, styles.bottomSheetActionButtonDestructive]}>
                <Text style={[styles.bottomSheetActionText, styles.bottomSheetActionTextDestructive]}>Log out</Text>
              </Pressable>
            </Animated.View>
          </PanGestureHandler>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={handleDismissGuestBottomNavPrompt}
        transparent
        visible={showGuestBottomNavPrompt}
      >
        <View style={styles.guestFavoriteModalBackdrop}>
          <View style={styles.guestFavoriteModalCard}>
            <Pressable accessibilityLabel="Close account prompt" onPress={handleDismissGuestBottomNavPrompt} style={styles.guestBottomNavCloseButton}>
              <Text style={styles.guestBottomNavCloseButtonText}>X</Text>
            </Pressable>
            <Text style={styles.guestFavoriteModalTitle}>An account is required to open this area</Text>
            <Text style={styles.guestFavoriteModalText}>
              Keep exploring the map as a guest, or create a free account now to open profile and menu features.
            </Text>
            <View style={styles.guestFavoriteModalActions}>
              <Pressable onPress={handleCreateCustomerAccountFromGuestBottomNav} style={styles.guestFavoriteModalPrimaryButton}>
                <Text style={styles.guestFavoriteModalPrimaryText}>Customer</Text>
              </Pressable>
              <Pressable onPress={handleCreateBusinessAccountFromGuestBottomNav} style={styles.guestFavoriteModalSecondaryButton}>
                <Text style={styles.guestFavoriteModalSecondaryText}>Business</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
      <Modal
        animationType="fade"
        onRequestClose={handleDismissGuestAccuracyPrompt}
        transparent
        visible={showGuestAccuracyPrompt}
      >
        <View style={styles.guestFavoriteModalBackdrop}>
          <View style={styles.guestFavoriteModalCard}>
            <Pressable accessibilityLabel="Close account prompt" onPress={handleDismissGuestAccuracyPrompt} style={styles.guestBottomNavCloseButton}>
              <Text style={styles.guestBottomNavCloseButtonText}>X</Text>
            </Pressable>
            <Text style={styles.guestFavoriteModalTitle}>Create an account to report business profile updates</Text>
            <Text style={styles.guestFavoriteModalText}>
              Sign in or create an account to send profile accuracy updates so the team can follow up and review your submission.
            </Text>
            <View style={styles.guestFavoriteModalActions}>
              <Pressable onPress={handleCreateCustomerAccountFromGuestAccuracy} style={styles.guestFavoriteModalPrimaryButton}>
                <Text style={styles.guestFavoriteModalPrimaryText}>Customer</Text>
              </Pressable>
              <Pressable onPress={handleCreateBusinessAccountFromGuestAccuracy} style={styles.guestFavoriteModalSecondaryButton}>
                <Text style={styles.guestFavoriteModalSecondaryText}>Business</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={handleDismissGuestBusinessClaimPrompt}
        transparent
        visible={showGuestBusinessClaimPrompt}
      >
        <View style={styles.guestFavoriteModalBackdrop}>
          <View style={styles.guestFavoriteModalCard}>
            <Text style={styles.guestFavoriteModalTitle}>Create a free business account to claim this business</Text>
            <Text style={styles.guestFavoriteModalText}>
              Create a free business account to start the verification process for this business profile and submit your ownership or manager claim.
            </Text>
            <View style={styles.guestFavoriteModalActions}>
              <Pressable onPress={handleDismissGuestBusinessClaimPrompt} style={styles.guestFavoriteModalSecondaryButton}>
                <Text style={styles.guestFavoriteModalSecondaryText}>Maybe later</Text>
              </Pressable>
              <Pressable onPress={handleCreateBusinessAccountFromGuestClaim} style={styles.guestFavoriteModalPrimaryButton}>
                <Text style={styles.guestFavoriteModalPrimaryText}>Create free business account</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={handleDismissCustomerBusinessClaimPrompt}
        transparent
        visible={showCustomerBusinessClaimPrompt}
      >
        <View style={styles.guestFavoriteModalBackdrop}>
          <View style={styles.guestFavoriteModalCard}>
            <Text style={styles.guestFavoriteModalTitle}>Convert your customer account into a business account?</Text>
            <Text style={styles.guestFavoriteModalText}>
              Proceeding will use your current customer account for this business claim so you can verify that you own or manage this business.
            </Text>
            <View style={styles.guestFavoriteModalActions}>
              <Pressable onPress={handleDismissCustomerBusinessClaimPrompt} style={styles.guestFavoriteModalSecondaryButton}>
                <Text style={styles.guestFavoriteModalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleProceedWithCustomerBusinessClaim} style={styles.guestFavoriteModalPrimaryButton}>
                <Text style={styles.guestFavoriteModalPrimaryText}>Proceed</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={handleDismissCustomerBusinessClaimNotice}
        transparent
        visible={customerBusinessClaimNotice !== null}
      >
        <View style={styles.guestFavoriteModalBackdrop}>
          <View style={styles.guestFavoriteModalCard}>
            <Text style={styles.guestFavoriteModalTitle}>Business claim submitted</Text>
            <Text style={styles.guestFavoriteModalText}>
              {customerBusinessClaimNotice
                ? `You just submitted a business claim for ${customerBusinessClaimNotice.businessName} at ${customerBusinessClaimNotice.locationLabel}. DiningDealz will send you a confirmation email that we received your claim, followed by another email with the next update on your review.`
                : ''}
            </Text>
            <View style={styles.guestFavoriteModalActions}>
              <Pressable onPress={handleDismissCustomerBusinessClaimNotice} style={styles.guestFavoriteModalPrimaryButton}>
                <Text style={styles.guestFavoriteModalPrimaryText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <PhotoLightbox
        imageUrls={displayedMapPreviewImageUrls}
        initialIndex={mapPreviewPhotoLightboxIndex}
        onClose={() => setMapPreviewPhotoLightboxVisible(false)}
        visible={mapPreviewPhotoLightboxVisible}
      />
    </>
  );
}

function AnimatedListPlaceCard({
  browseListColumns,
  distanceLabel,
  item,
  listRevealEnabled,
  onPress,
  revealIndex,
  revealToken,
}: {
  browseListColumns: number;
  distanceLabel: string | null;
  item: BrowsePlace;
  listRevealEnabled: boolean;
  onPress: () => void;
  revealIndex: number;
  revealToken: number;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const cardImageUrl = getPlaceCardImageUrl(item);

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
        {cardImageUrl ? (
          <Image resizeMode="cover" source={{ uri: cardImageUrl }} style={styles.placeCardImage} />
        ) : null}
        <Text style={styles.placeCity}>{getPlaceCardEyebrow(item)}</Text>
        <Text style={styles.placeTitle}>{item.name}</Text>
        <Text style={styles.placeMeta}>{item.venue_type_label}</Text>
        {distanceLabel ? <Text style={styles.placeMeta}>{distanceLabel}</Text> : null}
        <Text style={styles.placeAddress}>{getPlaceCardAddress(item)}</Text>
      </Pressable>
    </Animated.View>
  );
}

const BrowsePlaceList = memo(function BrowsePlaceList({
  browseListColumns,
  displayedBrowsePlaces,
  listRevealEnabled,
  listRevealToken,
  normalizedSearchQuery,
  onSelectPlace,
  userCoordinates,
}: {
  browseListColumns: number;
  displayedBrowsePlaces: BrowsePlace[];
  listRevealEnabled: boolean;
  listRevealToken: number;
  normalizedSearchQuery: string;
  onSelectPlace: (place: { slug: string; locationId?: number }) => void;
  userCoordinates: UserCoordinates | null;
}) {
  const renderBrowsePlaceItem = useCallback(({ index, item }: { index: number; item: BrowsePlace }) => (
    <AnimatedListPlaceCard
      browseListColumns={browseListColumns}
      distanceLabel={getDistanceAwayLabel(userCoordinates, item)}
      item={item}
      listRevealEnabled={listRevealEnabled}
      onPress={() => onSelectPlace(item)}
      revealIndex={index}
      revealToken={listRevealToken}
    />
  ), [browseListColumns, listRevealEnabled, listRevealToken, onSelectPlace, userCoordinates]);

  const emptyBrowseList = displayedBrowsePlaces.length === 0
    ? <Text style={styles.emptyStateText}>{getBrowseEmptyStateMessage(normalizedSearchQuery)}</Text>
    : null;

  return (
    <FlatList
      columnWrapperStyle={browseListColumns > 1 ? styles.placeCardColumn : undefined}
      contentContainerStyle={[styles.listContent, browseListColumns > 1 ? styles.listContentLandscape : null]}
      data={displayedBrowsePlaces}
      initialNumToRender={6}
      key={browseListColumns}
      keyExtractor={(item) => item.listKey}
      ListEmptyComponent={emptyBrowseList}
      numColumns={browseListColumns}
      renderItem={renderBrowsePlaceItem}
      showsVerticalScrollIndicator={false}
    />
  );
});

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

function getDistanceAwayLabel(
  userCoordinates: UserCoordinates | null,
  location: Pick<PlaceLocation, 'latitude' | 'longitude'> | null,
) {
  if (!userCoordinates || !location || location.latitude === null || location.longitude === null) {
    return null;
  }

  const miles = getDistanceInMiles(userCoordinates.latitude, userCoordinates.longitude, location.latitude, location.longitude);
  if (!Number.isFinite(miles)) {
    return null;
  }

  if (miles < 0.15) {
    return 'Nearby';
  }

  const roundedMiles = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  const mileLabel = roundedMiles === 1 ? 'mile' : 'miles';
  return `${roundedMiles} ${mileLabel} away`;
}

function getDistanceInMiles(
  originLatitude: number,
  originLongitude: number,
  destinationLatitude: number,
  destinationLongitude: number,
) {
  const earthRadiusMiles = 3958.8;
  const latitudeDeltaRadians = toRadians(destinationLatitude - originLatitude);
  const longitudeDeltaRadians = toRadians(destinationLongitude - originLongitude);
  const originLatitudeRadians = toRadians(originLatitude);
  const destinationLatitudeRadians = toRadians(destinationLatitude);

  const a = Math.sin(latitudeDeltaRadians / 2) ** 2
    + Math.cos(originLatitudeRadians)
      * Math.cos(destinationLatitudeRadians)
      * Math.sin(longitudeDeltaRadians / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function clearTrackedCoordinatesForBusiness(place: PlaceListItem, approvedBusinessSlugs: Set<string>): PlaceListItem {
  if (!approvedBusinessSlugs.has(place.slug)) {
    return place;
  }

  const nextLocations = getPlaceLocations(place).map((location) => ({
    ...location,
    latitude: null,
    longitude: null,
  }));

  return {
    ...place,
    latitude: null,
    longitude: null,
    locations: nextLocations,
  };
}

function clearTrackedCoordinatesForBusinessDetail(place: PlaceDetail, approvedBusinessSlugs: Set<string>): PlaceDetail {
  if (!approvedBusinessSlugs.has(place.slug)) {
    return place;
  }

  return {
    ...place,
    latitude: null,
    longitude: null,
    locations: place.locations.map((location) => ({
      ...location,
      latitude: null,
      longitude: null,
    })),
  };
}

function applyTrackedCoordinatesToBusiness(
  place: PlaceListItem,
  approvedBusinessSlugs: Set<string>,
  latitude: number,
  longitude: number,
): PlaceListItem {
  if (!approvedBusinessSlugs.has(place.slug)) {
    return place;
  }

  const nextLocations = getPlaceLocations(place).map((location) => ({
    ...location,
    latitude,
    longitude,
  }));

  return {
    ...place,
    latitude,
    longitude,
    locations: nextLocations,
  };
}

function applyTrackedCoordinatesToBusinessDetail(
  place: PlaceDetail,
  approvedBusinessSlugs: Set<string>,
  latitude: number,
  longitude: number,
): PlaceDetail {
  if (!approvedBusinessSlugs.has(place.slug)) {
    return place;
  }

  return {
    ...place,
    latitude,
    longitude,
    locations: place.locations.map((location) => ({
      ...location,
      latitude,
      longitude,
    })),
  };
}

function toRadians(value: number) {
  return value * (Math.PI / 180);
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
    informalBusinessesOnly: boolean;
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
      const hasConfirmedDeals = place.deal_count > 0 || getPlaceLocations(place).some((location) => location.deal_count > 0);
      const matchesDeals = !filters.confirmedDealsOnly || hasConfirmedDeals;
      const matchesInformal = !filters.informalBusinessesOnly || !!place.is_informal;
      const matchesOperatingDays = !filters.selectedOperatingDays.length || hasAnyMatchingWeekday(place.operating_weekdays, filters.selectedOperatingDays);
      const matchesDealDays = !filters.selectedDealDays.length || hasAnyMatchingWeekday(place.deal_weekdays, filters.selectedDealDays);
      const matchesVerified = !filters.verifiedBusinessesOnly || place.is_claimed;

      return matchesCity && matchesVenueType && matchesSearch && matchesDeals && matchesInformal && matchesOperatingDays && matchesDealDays && matchesVerified;
    })
    .sort((first, second) => {
      if (filters.searchQuery.length === 0) {
        return first.index - second.index;
      }

      return second.score - first.score || first.place.name.localeCompare(second.place.name);
    })
    .map(({ place }) => place);
}

function getFilteredBrowseLocations(
  filteredPlaces: PlaceListItem[],
  filters: {
    confirmedDealsOnly: boolean;
    searchQuery: string;
    selectedCity: CityFilterValue;
    selectedDealDays: WeekdayFilterValue[];
    selectedOperatingDays: WeekdayFilterValue[];
  },
) {
  return filteredPlaces.flatMap((place) => {
    const placeScore = getPlaceSearchScore(place, filters.searchQuery);

    return getPlaceLocations(place)
      .map((location) => ({
        listKey: `${place.slug}:${location.id}`,
        location,
        markerKey: `${place.slug}:${location.id}`,
        place,
        score: placeScore + getLocationSearchScore(location, filters.searchQuery),
      }))
      .filter(({ location, score }) => {
        const matchesCity = filters.selectedCity === 'all' || location.city === filters.selectedCity;
        const matchesSearch = filters.searchQuery.length === 0 || score > 0;
        const matchesDeals = !filters.confirmedDealsOnly || intValue(location.deal_count) > 0;
        const matchesOperatingDays = !filters.selectedOperatingDays.length || hasAnyMatchingWeekday(location.operating_weekdays ?? [], filters.selectedOperatingDays);
        const matchesDealDays = !filters.selectedDealDays.length || hasAnyMatchingWeekday(location.deal_weekdays ?? [], filters.selectedDealDays);

        return matchesCity && matchesSearch && matchesDeals && matchesOperatingDays && matchesDealDays;
      });
  });
}

function intValue(value: unknown) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function getMappedPlacesForBrowse(filteredLocations: Array<{ listKey: string; location: PlaceLocation; markerKey: string; place: PlaceListItem }>): MappedPlace[] {
  return filteredLocations.flatMap(({ location, markerKey, place }) => {
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
        fullAddress: getMapPlaceFullAddress(location),
        locationId: location.id,
        markerLatitude: location.latitude,
        markerLongitude: location.longitude,
        markerKey,
        locations: [location],
      },
    ];
  });
}

function getMapSearchResults(filteredLocations: Array<{ listKey: string; location: PlaceLocation; markerKey: string; place: PlaceListItem }>): MapSearchResultPlace[] {
  return filteredLocations.map(({ listKey, location, markerKey, place }) => ({
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
    fullAddress: getMapPlaceFullAddress(location),
    locationId: location.id,
    markerKey: location.latitude !== null && location.longitude !== null ? markerKey : null,
    resultKey: listKey,
    locations: [location],
  }));
}

function getBrowsePlacesForDisplay(filteredLocations: Array<{ listKey: string; location: PlaceLocation; place: PlaceListItem }>): BrowsePlace[] {
  return filteredLocations.map(({ listKey, location, place }) => ({
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
      fullAddress: getMapPlaceFullAddress(location),
      locationId: location.id,
      listKey,
      locations: [location],
    }));
}

function getMapPlaceFullAddress(location: PlaceLocation) {
  const hasStreetAddress = Boolean(String(location.address_line_1 || '').trim() || String(location.address_line_2 || '').trim());
  if (hasStreetAddress) {
    return formatPlaceAddress(location);
  }

  return location.city_label
    ? `No established address on file in ${location.city_label}`
    : 'No established address on file';
}

function hasAnyMatchingWeekday(placeWeekdays: number[], selectedWeekdays: WeekdayFilterValue[]) {
  return selectedWeekdays.some((weekday) => placeWeekdays.includes(weekday));
}

function getLocationSearchScore(location: PlaceLocation, searchQuery: string) {
  if (!searchQuery.length) {
    return 0;
  }

  const searchFields = [
    { value: normalizeSearchText(location.city_label), weight: 6 },
    { value: normalizeSearchText(location.neighborhood), weight: 7 },
    { value: normalizeSearchText(location.address_line_1), weight: 8 },
    { value: normalizeSearchText(location.address_line_2), weight: 3 },
    { value: normalizeSearchText(formatPlaceAddress(location)), weight: 9 },
    { value: normalizeSearchText(location.postal_code), weight: 2 },
  ];

  return searchFields.reduce((totalScore, field) => {
    return totalScore + (getTokenMatchScore(field.value, searchQuery) * field.weight);
  }, 0);
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
