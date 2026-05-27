import { startTransition, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Keyboard,
  LayoutAnimation,
  Linking,
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
  createBusinessProfile,
  createCustomerProfile,
  createManualBusinessProfile,
  fetchProfileDashboard,
  fetchPlaceDetail,
  fetchPlaces,
  getDefaultApiBaseUrl,
  loginProfile,
  resendVerificationEmail,
  updateTwoFactorPreference,
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
  venueFilters,
  type VenueFilterValue,
  weekdayFilters,
  type WeekdayFilterValue,
} from './src/browseConfig';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { BrowseControls } from './src/screens/BrowseControls';
import { PlaceDetailScreen } from './src/screens/PlaceDetailScreen';
import { SplashScreen } from './src/screens/SplashScreen';
import {
  AuthPortalScreen,
  BusinessSearchScreen,
  BusinessVerificationScreen,
  CreateProfileScreen,
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
  BusinessSignupRequest,
  CustomerSignupRequest,
  LoginRequest,
  ManualBusinessSignupRequest,
  PlaceDetail,
  PlaceListItem,
  PlaceLocation,
  PlaceLocationDetail,
  SignupResponse,
} from './src/types';

const initialApiBaseUrl = getDefaultApiBaseUrl();
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
type AppScreenMode = 'splash' | 'auth' | 'browse' | 'profiles' | 'business-search' | 'business-claim' | 'manual-business-claim';
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

const initialProfileFormState: ProfileFormState = {
  username: '',
  email: '',
  password: '',
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
  verification_summary: '',
  supporting_details: '',
};

const initialLoginFormState: LoginFormState = {
  identifier: '',
  password: '',
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
  const browseModeTransition = useRef(new Animated.Value(1)).current;
  const mapPinsTransition = useRef(new Animated.Value(1)).current;
  const mapResultsOpacity = useRef(new Animated.Value(0)).current;
  const mapThemeFade = useRef(new Animated.Value(0)).current;
  const [apiBaseUrl, setApiBaseUrl] = useState(initialApiBaseUrl);
  const [screenMode, setScreenMode] = useState<AppScreenMode>('splash');
  const [onboardingTransitionDirection, setOnboardingTransitionDirection] = useState<OnboardingTransitionDirection>('forward');
  const [onboardingTransitionAxis, setOnboardingTransitionAxis] = useState<TransitionAxis>('x');
  const [onboardingIncomingOffset, setOnboardingIncomingOffset] = useState(0);
  const [authPortal, setAuthPortal] = useState<AuthPortal>('customer');
  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginFormState);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
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
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>(() => initialMapRegionRef.current);
  const mapRegionRef = useRef(mapRegion);
  const [reloadCount, setReloadCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showMapResultsCard, setShowMapResultsCard] = useState(false);
  const [renderedMapSearchResults, setRenderedMapSearchResults] = useState<MappedPlace[]>([]);
  const [renderedMapResultsKey, setRenderedMapResultsKey] = useState('');
  const [renderedMapResultCount, setRenderedMapResultCount] = useState(0);
  const [visibleMapResultCount, setVisibleMapResultCount] = useState(0);
  const [loadingMoreMapResults, setLoadingMoreMapResults] = useState(false);
  const [listRevealToken, setListRevealToken] = useState(0);
  const [listRevealEnabled, setListRevealEnabled] = useState(browseMode === 'list');
  const showMoreMapResultsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingListRevealRef = useRef(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(initialProfileFormState);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardSubmitting, setDashboardSubmitting] = useState(false);
  const [profilePlaces, setProfilePlaces] = useState<PlaceListItem[]>([]);
  const [profilePlacesLoading, setProfilePlacesLoading] = useState(false);
  const [businessSearchQuery, setBusinessSearchQuery] = useState('');
  const [selectedClaimPlace, setSelectedClaimPlace] = useState<PlaceListItem | null>(null);
  const [selectedClaimLocationId, setSelectedClaimLocationId] = useState<number | null>(null);
  const [logoutTransitionSession, setLogoutTransitionSession] = useState<SignupResponse | null>(null);
  const [incomingOnboardingScreen, setIncomingOnboardingScreen] = useState<AppScreenMode | null>(null);
  const [showLoginSuccessTransition, setShowLoginSuccessTransition] = useState(false);
  const [showLogoutTransition, setShowLogoutTransition] = useState(false);
  const [authIntroPending, setAuthIntroPending] = useState(false);
  const [splashExiting, setSplashExiting] = useState(false);
  const [profileEntryOffset, setProfileEntryOffset] = useState(0);
  const [browseEntryOffset, setBrowseEntryOffset] = useState(0);
  const [renderedMappedPlaces, setRenderedMappedPlaces] = useState<MappedPlace[]>([]);
  const [renderedMappedPlaceKey, setRenderedMappedPlaceKey] = useState('');
  const shouldUseNativeMapBoundaries = false;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = normalizeSearchText(deferredSearchQuery);
  const onboardingTransitionDuration = 480;
  const showMapBrowse = screenMode === 'browse' && !selectedPlaceSlug && browseMode === 'map';

  const filteredPlaces = getFilteredPlaces(places, {
    confirmedDealsOnly,
    searchQuery: normalizedSearchQuery,
    selectedDealDays,
    selectedOperatingDays,
    selectedVenueTypes,
    verifiedBusinessesOnly,
  });
  const filteredPlaceKey = filteredPlaces.map((place) => place.id).join('|');

  const mappedPlaces = showMapBrowse
    ? filteredPlaces.flatMap((place) => (
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
      ))
    : [];
  const mappedPlaceKey = mappedPlaces.map((place) => place.markerKey).join('|');
  const displayedMapPlaces = showMapBrowse ? renderedMappedPlaces : [];
  const unplacedPlaceCount = filteredPlaces.filter((place) => (
    !getPlaceLocations(place).some((location) => location.latitude !== null && location.longitude !== null)
  )).length;
  const selectedMapPlace = selectedMapPlaceKey
    ? displayedMapPlaces.find((place) => place.markerKey === selectedMapPlaceKey) ?? null
    : null;
  const selectedMapImageUrls = selectedMapPlace ? dedupeImageUrls(selectedMapPlace.image_urls) : [];
  const selectedPlaceLocation = getSelectedPlaceLocation(selectedPlace, selectedLocationId, selectedCity);
  const selectedPlaceDeals = selectedPlaceLocation?.deals ?? selectedPlace?.deals ?? [];
  const selectedPlaceOperatingHours = selectedPlaceLocation?.operating_hours ?? selectedPlace?.operating_hours ?? [];

  useEffect(() => {
    mapRegionRef.current = mapRegion;
  }, [mapRegion]);

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

  useEffect(() => () => {
    clearShowMoreMapResultsTimer();
  }, []);
  const availableClaimPlaces = consolidatePlacesBySlug(availableProfilePlaces);
  const onboardingScreenKeys = new Set<AppScreenMode>(['splash', 'auth', 'profiles', 'business-search', 'business-claim', 'manual-business-claim']);
  const currentOnboardingScreen = onboardingScreenKeys.has(screenMode) ? screenMode : null;
  const usesOnboardingSlideTransition = currentOnboardingScreen !== null || incomingOnboardingScreen !== null;
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

    const animatePinsIn = (nextPlaces: MappedPlace[], nextKey: string) => {
      setRenderedMappedPlaces(nextPlaces);
      setRenderedMappedPlaceKey(nextKey);
      mapPinsTransition.stopAnimation();
      mapPinsTransition.setValue(0);
      requestAnimationFrame(() => {
        Animated.timing(mapPinsTransition, {
          duration: 340,
          toValue: 1,
          useNativeDriver: true,
        }).start();
      });
    };

    if (!renderedMappedPlaceKey) {
      animatePinsIn(mappedPlaces, mappedPlaceKey);
      return;
    }

    if (renderedMappedPlaceKey === mappedPlaceKey) {
      return;
    }

    mapPinsTransition.stopAnimation();
    Animated.timing(mapPinsTransition, {
      duration: 160,
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      animatePinsIn(mappedPlaces, mappedPlaceKey);
    });
  }, [listLoading, mapPinsTransition, mappedPlaceKey, renderedMappedPlaceKey, renderedMappedPlaces.length, showMapBrowse]);

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

  function startLoginSuccessTransition() {
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

  useEffect(() => {
    if (screenMode !== 'splash') {
      return;
    }

    const timeoutId = setTimeout(() => {
      const nextScreen = authenticatedSession ? 'browse' : 'auth';

      if (splashExiting) {
        return;
      }

      setSplashExiting(true);
      splashExitOpacity.stopAnimation();
      splashExitOpacity.setValue(1);
      Animated.timing(splashExitOpacity, {
        duration: 260,
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }

        setAuthIntroPending(nextScreen === 'auth');
        setScreenMode(nextScreen);
        setSplashExiting(false);
        requestAnimationFrame(() => {
          splashExitOpacity.setValue(1);
        });
      });
    }, 1200);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [authenticatedSession, screenMode, splashExitOpacity, splashExiting]);

  useEffect(() => {
    if (shouldShowMapResults) {
      const resultsChanged = (
        mapSearchResultsKey !== renderedMapResultsKey ||
        filteredPlaces.length !== renderedMapResultCount
      );

      if (resultsChanged) {
        const nextVisibleCount = Math.min(5, mapSearchResultPool.length);
        setVisibleMapResultCount(nextVisibleCount);
        setRenderedMapSearchResults(mapSearchResultPool.slice(0, nextVisibleCount));
        setRenderedMapResultsKey(mapSearchResultsKey);
        setRenderedMapResultCount(filteredPlaces.length);
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
      setRenderedMapSearchResults([]);
      setRenderedMapResultsKey('');
      setRenderedMapResultCount(0);
      setVisibleMapResultCount(0);
      setLoadingMoreMapResults(false);
      clearShowMoreMapResultsTimer();
    });
  }, [
    filteredPlaces.length,
    mapResultsOpacity,
    mapSearchResultPool,
    mapSearchResultsKey,
    renderedMapResultCount,
    renderedMapResultsKey,
    shouldShowMapResults,
    showMapResultsCard,
  ]);

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
      return;
    }

    const nextRegion = getBrowseMapRegion(selectedCity, mappedPlaces);
    setMapRegion((currentRegion) => {
      const boundedRegion = clampRegionToBounds(nextRegion);
      if (areRegionsEqual(currentRegion, boundedRegion)) {
        return currentRegion;
      }

      if (mapRef.current) {
        mapRef.current.animateToRegion(boundedRegion, 250);
      }

      return boundedRegion;
    });
  }, [filteredPlaceKey, listLoading, selectedCity, showMapBrowse]);

  useEffect(() => {
    if (!['profiles', 'business-search', 'business-claim', 'manual-business-claim'].includes(screenMode)) {
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

    void refreshDashboard();
  }, [apiBaseUrl, authenticatedSession?.auth_token, screenMode]);

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

  useLayoutEffect(() => {
    if (!browseModeFadePendingRef.current) {
      return;
    }

    browseModeFadePendingRef.current = false;
    browseModeTransition.setValue(0);
    browseModeTransition.stopAnimation();
    Animated.timing(browseModeTransition, {
      duration: 190,
      toValue: 1,
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

    if (Platform.OS !== 'ios' || nextDarkMode === displayedDarkMapMode) {
      setDisplayedDarkMapMode(nextDarkMode);
      setTransitioningMapTheme(null);
      mapThemeFade.stopAnimation();
      mapThemeFade.setValue(0);
      return;
    }

    setTransitioningMapTheme(nextDarkMode);
    mapThemeFade.stopAnimation();
    mapThemeFade.setValue(0);
    Animated.timing(mapThemeFade, {
      duration: 240,
      toValue: 1,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setDisplayedDarkMapMode(nextDarkMode);
      setTransitioningMapTheme(null);
      mapThemeFade.setValue(0);
    });
  }

  function handleBrowseModeChange(mode: BrowseMode) {
    if (mode === browseMode) {
      return;
    }

    animateNextLayout();
    setBrowseFiltersExpanded(false);
    setSelectedMapPlaceKey(null);
    pendingListRevealRef.current = mode === 'list';
    setListRevealEnabled(false);
    browseModeTransition.stopAnimation();
    browseModeFadePendingRef.current = true;
    setBrowseMode(mode);
  }

  function handleToggleBrowseFilters() {
    animateNextLayout();
    setBrowseFiltersExpanded((current) => !current);
  }

  function handleClearSearchQuery() {
    animateNextLayout();
    setSearchQuery('');
    setSelectedMapPlaceKey(null);
  }

  function handleBackToBrowse() {
    animateNextLayout();
    Keyboard.dismiss();
    setSelectedPlaceSlug(null);
  }

  function handleOpenProfiles() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    if (authenticatedSession && screenMode === 'browse') {
      setProfileEntryOffset(width);
    }
    navigateScreen('profiles', 'forward');
  }

  function handleContinueToApp() {
    dismissKeyboardForScreenTransition();
    setAuthMessage(null);
    setProfileErrorMessage(null);
    setBrowseEntryOffset(authenticatedSession && screenMode === 'profiles' ? -width : -width);
    navigateScreen('browse', 'forward');
  }

  function handleBackFromProfiles() {
    dismissKeyboardForScreenTransition();
    if (authenticatedSession) {
      setBrowseEntryOffset(-width);
    }
    navigateScreen(authenticatedSession ? 'browse' : 'auth', 'backward');
  }

  function handleChangeLoginField(field: keyof LoginFormState, value: string) {
    setLoginForm((current) => ({ ...current, [field]: value }));
  }

  function handleChangeProfileField(field: keyof ProfileFormState, value: string) {
    setProfileForm((current) => ({ ...current, [field]: value }));
  }

  function handleChangeProfileToggle(field: 'address_not_applicable', value: boolean) {
    setProfileForm((current) => ({ ...current, [field]: value }));
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

  async function handleLogin() {
    setLoginSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const payload: LoginRequest = {
        portal: authPortal,
        identifier: loginForm.identifier,
        password: loginForm.password,
      };
      const response = await loginProfile(apiBaseUrl, payload);
      setAuthenticatedSession(response);
      setAuthMessage(null);
      setLoginForm(initialLoginFormState);
      setProfileMessage('Signed in successfully.');
      startLoginSuccessTransition();
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleSubmitCustomerProfile() {
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
      setAuthenticatedSession(response);
      setAuthPortal('customer');
      setProfileMessage(`Account created for ${response.username}. Check your email to verify your address.`);
      navigateScreen('profiles', 'forward');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleSubmitClaimedBusinessProfile() {
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
        business_slug: profileForm.business_slug,
        contact_name: profileForm.contact_name,
        job_title: profileForm.job_title,
        work_email: profileForm.work_email,
        work_phone: profileForm.work_phone,
        employer_address: profileForm.employer_address,
        address_not_applicable: false,
        verification_summary: profileForm.verification_summary,
        supporting_details: profileForm.supporting_details,
      };
      const response = await createBusinessProfile(apiBaseUrl, payload);
      setProfileForm(initialProfileFormState);
      setSelectedClaimPlace(null);
      setAuthenticatedSession(response);
      setAuthPortal('business');
      setProfileMessage(`Business claim submitted for ${response.business_name ?? 'your business'}. Check your email to verify your address.`);
      navigateScreen('profiles', 'forward');
    } catch (error) {
      setProfileErrorMessage(getErrorMessage(error));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleSubmitManualBusinessProfile() {
    setProfileSubmitting(true);
    setProfileErrorMessage(null);
    setProfileMessage(null);

    try {
      const payload: ManualBusinessSignupRequest = {
        username: profileForm.username,
        email: profileForm.email,
        password: profileForm.password,
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        business_name: profileForm.business_name,
        business_city: profileForm.business_city,
        business_venue_type: profileForm.business_venue_type,
        business_website_url: profileForm.business_website_url,
        contact_name: profileForm.contact_name,
        job_title: profileForm.job_title,
        work_email: profileForm.work_email,
        work_phone: profileForm.work_phone,
        employer_address: profileForm.employer_address,
        address_not_applicable: profileForm.address_not_applicable,
        verification_summary: profileForm.verification_summary,
        supporting_details: profileForm.supporting_details,
      };
      const response = await createManualBusinessProfile(apiBaseUrl, payload);
      setProfileForm(initialProfileFormState);
      setSelectedClaimPlace(null);
      setAuthenticatedSession(response);
      setAuthPortal('business');
      setProfileMessage(`Business profile submitted for ${response.business_name ?? 'your business'}. Check your email to verify your address.`);
      navigateScreen('profiles', 'forward');
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

  async function handleToggleTwoFactor() {
    if (!authenticatedSession?.auth_token) {
      return;
    }

    setDashboardSubmitting(true);
    setProfileErrorMessage(null);

    try {
      const response = await updateTwoFactorPreference(
        apiBaseUrl,
        authenticatedSession.auth_token,
        !authenticatedSession.two_factor_enabled,
        authenticatedSession.portal,
      );
      setAuthenticatedSession(response);
      setProfileMessage(response.two_factor_enabled ? '2FA preference enabled.' : '2FA preference disabled.');
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

  function handleBackToBusinessSearch() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    navigateScreen('business-search', 'backward');
  }

  function handleOpenManualBusinessClaim() {
    dismissKeyboardForScreenTransition();
    setProfileErrorMessage(null);
    setSelectedClaimPlace(null);
    setSelectedClaimLocationId(null);
    setProfileForm((current) => ({
      ...current,
      business_slug: '',
      business_name: '',
      business_city: '',
      business_venue_type: '',
      business_website_url: '',
      employer_address: '',
      address_not_applicable: false,
    }));
    navigateScreen('manual-business-claim', 'forward');
  }

  function handleSelectClaimBusiness(place: PlaceListItem, locationId: number) {
    dismissKeyboardForScreenTransition();
    const selectedLocation = getPlaceLocations(place).find((location) => location.id === locationId) ?? getPlaceLocations(place)[0] ?? place;
    setSelectedClaimPlace(place);
    setSelectedClaimLocationId(selectedLocation.id);
    setProfileForm((current) => ({
      ...current,
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
    setSelectedMapPlaceKey(null);
  }

  function handleFocusMapResult(place: MappedPlace) {
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

  function renderOnboardingScreen(targetScreen: AppScreenMode, profileSessionOverride?: SignupResponse | null) {
    switch (targetScreen) {
      case 'splash':
        return (
          <SafeAreaView style={styles.safeArea}>
            <SplashScreen />
          </SafeAreaView>
        );
      case 'auth':
        return (
          <SafeAreaView style={styles.safeArea}>
            <AuthPortalScreen
              authMessage={authMessage}
              errorMessage={profileErrorMessage}
              loginForm={loginForm}
              loginPortal={authPortal}
              onChangeField={handleChangeLoginField}
              onContinueToApp={handleContinueToApp}
              onOpenProfiles={handleOpenProfiles}
              onSelectPortal={setAuthPortal}
              onSubmit={handleLogin}
              submitting={loginSubmitting}
            />
          </SafeAreaView>
        );
      case 'profiles':
        {
          const profileSession = profileSessionOverride ?? authenticatedSession;

        return (
          <SafeAreaView style={styles.safeArea}>
            {profileSession ? (
              <DashboardScreen
                errorMessage={profileErrorMessage}
                isLandscape={isLandscape}
                loading={dashboardLoading}
                message={profileMessage}
                onBack={handleBackFromProfiles}
                onLogout={handleLogout}
                onOpenBilling={handleOpenBilling}
                onOpenPlaces={handleContinueToApp}
                onRefresh={() => void refreshDashboard()}
                onResendVerification={() => void handleResendVerification()}
                onToggleTwoFactor={() => void handleToggleTwoFactor()}
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
      case 'business-search':
        return (
          <SafeAreaView style={styles.safeArea}>
            <BusinessSearchScreen
              errorMessage={profileErrorMessage}
              isLandscape={isLandscape}
              loadingPlaces={profilePlacesLoading}
              onBack={handleBackToCreateProfile}
              onChangeSearchQuery={setBusinessSearchQuery}
              onChooseManualBusiness={handleOpenManualBusinessClaim}
              onSelectBusiness={handleSelectClaimBusiness}
              results={businessSearchResults}
              searchQuery={businessSearchQuery}
            />
          </SafeAreaView>
        );
      case 'business-claim':
        return (
          <SafeAreaView style={styles.safeArea}>
            <BusinessVerificationScreen
              errorMessage={profileErrorMessage}
              form={profileForm}
              isLandscape={isLandscape}
              mode="claimed"
              onBack={handleBackToBusinessSearch}
              onChangeField={handleChangeProfileField}
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
          <SafeAreaView style={styles.safeArea}>
            <BusinessVerificationScreen
              errorMessage={profileErrorMessage}
              form={profileForm}
              isLandscape={isLandscape}
              mode="manual"
              onBack={handleBackToBusinessSearch}
              onChangeField={handleChangeProfileField}
              onToggleAddressNotApplicable={(value) => handleChangeProfileToggle('address_not_applicable', value)}
              onSubmit={handleSubmitManualBusinessProfile}
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

  return (
    <>
      <StatusBar backgroundColor="transparent" style="dark" translucent={showMapBrowse} />
      {screenMode === 'splash' ? (
        <Animated.View style={[styles.onboardingTransitionRoot, { opacity: splashExitOpacity }]}>
          {renderOnboardingScreen('splash')}
        </Animated.View>
      ) : showLoginSuccessTransition ? (
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
      ) : selectedPlaceSlug ? (
        <View style={styles.fullScreenRoot}>
        <Animated.View style={[styles.screenTransitionLayerAbsolute, screenTransitionStyle]}>
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <PlaceDetailScreen
          detailLoading={detailLoading}
          errorMessage={errorMessage}
          isLandscape={isLandscape}
          onBack={handleBackToBrowse}
          onSelectLocation={setSelectedLocationId}
          selectedPlace={selectedPlace}
          selectedPlaceDeals={selectedPlaceDeals}
          selectedPlaceLocation={selectedPlaceLocation}
          selectedPlaceOperatingHours={selectedPlaceOperatingHours}
        />
        </SafeAreaView>
        </Animated.View>
        </View>
      ) : showMapBrowse ? (
        <View style={styles.fullScreenRoot}>
        <Animated.View style={[styles.screenTransitionLayerAbsolute, styles.fullScreenRoot, screenTransitionStyle, browseSceneTransitionStyle]}>
        <View style={styles.fullScreenRoot}>
        <View style={styles.mapScreen}>
          <Animated.View style={[styles.mapModeContentLayer, browseModeTransitionStyle]}>
          <MapView
            initialRegion={initialMapRegionRef.current}
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
              mapRef.current.animateToRegion(mapRegionRef.current, 0);
            }}
            onRegionChangeComplete={(nextRegion, details) => {
              const previousRegion = mapRegionRef.current;
              const boundedRegion = shouldUseNativeMapBoundaries
                ? normalizeRegion(nextRegion)
                : clampRegionToBounds(nextRegion);

              mapRegionRef.current = boundedRegion;

              if (details.isGesture) {
                const shouldIgnoreSnapForStationaryGesture = isStationaryMapGesture(previousRegion, nextRegion);

                if (!shouldUseNativeMapBoundaries && shouldIgnoreSnapForStationaryGesture && isWideMapRegion(nextRegion)) {
                  mapRegionRef.current = previousRegion;
                  setMapRegion((currentRegion) => (
                    areRegionsEqual(currentRegion, previousRegion) ? currentRegion : previousRegion
                  ));
                  mapRef.current?.animateToRegion(previousRegion, 180);
                  return;
                }

                if (!shouldUseNativeMapBoundaries && !shouldIgnoreSnapForStationaryGesture && shouldSnapRegionToBounds(nextRegion)) {
                  setMapRegion((currentRegion) => (
                    areRegionsEqual(currentRegion, boundedRegion) ? currentRegion : boundedRegion
                  ));
                  mapRef.current?.animateToRegion(boundedRegion, 180);
                }

                return;
              }

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
                onPress={() => setSelectedMapPlaceKey(place.markerKey)}
                tracksViewChanges={false}
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
                    tracksViewChanges={false}
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
          </Animated.View>

            <View
              pointerEvents="box-none"
              style={[
                styles.mapOverlayLayer,
                {
                  paddingTop: insets.top + 14,
                  paddingBottom: mapOverlayBottomPadding,
                },
              ]}
            >
            <BrowseControls
              browseMode={browseMode}
              confirmedDealsOnly={confirmedDealsOnly}
              overlay
              filtersExpanded={browseFiltersExpanded}
              isDarkMapMode={darkMapMode}
              onChangeSearchQuery={setSearchQuery}
              onClearSearchQuery={handleClearSearchQuery}
              onBrowseModeChange={handleBrowseModeChange}
              onReload={handleRefreshPlaces}
              onSelectAllVenueTypes={handleSelectAllVenueTypes}
              onSelectCity={setSelectedCity}
              onToggleConfirmedDealsOnly={handleToggleConfirmedDealsOnly}
              onToggleDealDay={handleToggleDealDay}
              onToggleFilters={handleToggleBrowseFilters}
              onToggleMapTheme={handleToggleMapTheme}
              onToggleOperatingDay={handleToggleOperatingDay}
              onToggleVenueType={handleToggleVenueType}
              onToggleVerifiedBusinessesOnly={handleToggleVerifiedBusinessesOnly}
              resultCount={filteredPlaces.length}
              searchQuery={searchQuery}
              selectedDealDays={selectedDealDays}
              selectedCity={selectedCity}
              selectedOperatingDays={selectedOperatingDays}
              selectedVenueTypes={selectedVenueTypes}
              verifiedBusinessesOnly={verifiedBusinessesOnly}
            />

            <Animated.View pointerEvents="box-none" style={[styles.mapOverlayContentLayer, browseModeTransitionStyle]}>

            {listLoading ? (
              <View style={styles.mapLoadingOverlay}>
                <ActivityIndicator color="#c65d1f" size="large" />
                <Text style={styles.mapOverlayText}>Loading places...</Text>
              </View>
            ) : null}

            {selectedMapPlace ? (
              <View style={[styles.mapPreviewCard, isLandscape ? styles.mapPreviewCardLandscape : null]}>
                <View style={styles.mapPreviewHeader}>
                  <View style={styles.mapPreviewCopy}>
                    <Text style={[styles.mapPreviewTitle, isLandscape ? styles.mapPreviewTitleLandscape : null]}>{selectedMapPlace.name}</Text>
                    <Text style={[styles.mapPreviewMeta, isLandscape ? styles.mapPreviewMetaLandscape : null]}>{selectedMapPlace.venue_type_label}</Text>
                  </View>
                  <View style={styles.mapPreviewActions}>
                    <Pressable onPress={handleClearMapSelection} style={[styles.mapPreviewIconButton, isLandscape ? styles.mapPreviewIconButtonLandscape : null]}>
                      <Text style={[styles.mapPreviewIconText, isLandscape ? styles.mapPreviewIconTextLandscape : null]}>×</Text>
                    </Pressable>
                    <Pressable onPress={() => handleSelectPlace(selectedMapPlace)} style={[styles.mapPreviewIconButton, isLandscape ? styles.mapPreviewIconButtonLandscape : null]}>
                      <Text style={[styles.mapPreviewIconText, isLandscape ? styles.mapPreviewIconTextLandscape : null]}>↗</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.mapPreviewDetails}>
                  <Text style={[styles.mapPreviewDetailText, isLandscape ? styles.mapPreviewDetailTextLandscape : null]}>{selectedMapPlace.fullAddress}</Text>
                  {selectedMapPlace.phone_number ? (
                    <Text style={[styles.mapPreviewDetailText, isLandscape ? styles.mapPreviewDetailTextLandscape : null]}>{selectedMapPlace.phone_number}</Text>
                  ) : null}
                </View>

                {selectedMapImageUrls.length ? (
                  <ScrollView
                    contentContainerStyle={[styles.mapPreviewGallery, isLandscape ? styles.mapPreviewGalleryLandscape : null]}
                    horizontal
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                    onScrollBeginDrag={Keyboard.dismiss}
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                  >
                    {selectedMapImageUrls.map((imageUrl) => (
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
              </View>
            ) : showMapResultsCard ? (
              <Animated.View style={[styles.mapResultsCard, { maxHeight: mapResultsCardMaxHeight, opacity: mapResultsOpacity }] }>
                <View style={styles.mapResultsHeader}>
                  <Text style={styles.mapResultsTitle}>Best matches</Text>
                  <Text style={styles.mapResultsMeta}>Top {renderedMapSearchResults.length} of {renderedMapResultCount} in view</Text>
                </View>
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
            ) : null}

            {errorMessage ? (
              <View style={[styles.errorBanner, styles.mapErrorBanner]}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
            </Animated.View>

            {authenticatedSession ? (
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
            ) : null}
          </View>
        </View>
        </View>
        </Animated.View>
        </View>
      ) : (
        <View style={styles.fullScreenRoot}>
        <Animated.View style={[styles.screenTransitionLayerAbsolute, screenTransitionStyle, browseSceneTransitionStyle]}>
        <SafeAreaView style={styles.safeArea}>
        <View style={[styles.screen, isLandscape ? styles.screenLandscape : null]}>
            <BrowseControls
              browseMode={browseMode}
              confirmedDealsOnly={confirmedDealsOnly}
              filtersExpanded={browseFiltersExpanded}
              isDarkMapMode={darkMapMode}
              onChangeSearchQuery={setSearchQuery}
              onClearSearchQuery={handleClearSearchQuery}
              onBrowseModeChange={handleBrowseModeChange}
              onOpenDashboard={authenticatedSession ? handleOpenProfiles : undefined}
              onReload={handleRefreshPlaces}
              onSelectAllVenueTypes={handleSelectAllVenueTypes}
              onSelectCity={setSelectedCity}
              onToggleConfirmedDealsOnly={handleToggleConfirmedDealsOnly}
              onToggleDealDay={handleToggleDealDay}
              onToggleFilters={handleToggleBrowseFilters}
              onToggleMapTheme={handleToggleMapTheme}
              onToggleOperatingDay={handleToggleOperatingDay}
              onToggleVenueType={handleToggleVenueType}
              onToggleVerifiedBusinessesOnly={handleToggleVerifiedBusinessesOnly}
              resultCount={filteredPlaces.length}
              searchQuery={searchQuery}
              selectedDealDays={selectedDealDays}
              selectedCity={selectedCity}
              selectedOperatingDays={selectedOperatingDays}
              selectedVenueTypes={selectedVenueTypes}
              verifiedBusinessesOnly={verifiedBusinessesOnly}
            />

            <Animated.View style={[styles.browseModeContentLayer, browseModeTransitionStyle]}>

            {listLoading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color="#c65d1f" size="large" />
                <Text style={styles.centerStateText}>Loading places...</Text>
              </View>
            ) : (
              <FlatList
                columnWrapperStyle={browseListColumns > 1 ? styles.placeCardColumn : undefined}
                contentContainerStyle={[styles.listContent, browseListColumns > 1 ? styles.listContentLandscape : null]}
                data={filteredPlaces}
                keyExtractor={(item) => item.id.toString()}
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
                ListEmptyComponent={filteredPlaces.length === 0 ? <Text style={styles.emptyStateText}>{getBrowseEmptyStateMessage(normalizedSearchQuery)}</Text> : null}
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
        </SafeAreaView>
        </Animated.View>
        </View>
      )}
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
  item: PlaceListItem;
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
  _place: MappedPlace,
  _region: Region,
  _width: number,
  _height: number,
  _transition: Animated.Value,
) {
  return {
    opacity: 1,
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
      const matchesVenueType = filters.selectedVenueTypes.includes(place.venue_type as VenueFilterValue);
      const matchesSearch = filters.searchQuery.length === 0 || score > 0;
      const matchesDeals = !filters.confirmedDealsOnly || place.has_deals || place.deal_count > 0;
      const matchesOperatingDays = !filters.selectedOperatingDays.length || hasAnyMatchingWeekday(place.operating_weekdays, filters.selectedOperatingDays);
      const matchesDealDays = !filters.selectedDealDays.length || hasAnyMatchingWeekday(place.deal_weekdays, filters.selectedDealDays);
      const matchesVerified = !filters.verifiedBusinessesOnly || place.is_verified;

      return matchesVenueType && matchesSearch && matchesDeals && matchesOperatingDays && matchesDealDays && matchesVerified;
    })
    .sort((first, second) => {
      if (filters.searchQuery.length === 0) {
        return first.index - second.index;
      }

      return second.score - first.score || first.place.name.localeCompare(second.place.name);
    })
    .map(({ place }) => place);
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
