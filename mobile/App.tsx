import { startTransition, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import type {
  BusinessSignupRequest,
  CustomerSignupRequest,
  HappyHourWindow,
  LoginRequest,
  ManualBusinessSignupRequest,
  OperatingHourWindow,
  PlaceDetail,
  PlaceListItem,
  PlaceLocation,
  PlaceLocationDetail,
  SignupResponse,
} from './src/types';

const cityFilters = [
  { label: 'All 805', value: 'all' },
  { label: 'Ventura', value: 'ventura' },
  { label: 'Oxnard', value: 'oxnard' },
  { label: 'Camarillo', value: 'camarillo' },
] as const;

type CityFilterValue = (typeof cityFilters)[number]['value'];

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
const venueMarkerStyles = {
  restaurant: { badge: 'R', fill: '#c65d1f', stroke: '#7f461f' },
  bar: { badge: 'B', fill: '#1f5f5b', stroke: '#143d3a' },
  fast_food: { badge: 'F', fill: '#d94b3d', stroke: '#8d2500' },
  cafe: { badge: 'C', fill: '#8b5e3c', stroke: '#5b3a21' },
  shop: { badge: 'S', fill: '#5f7cc6', stroke: '#34508c' },
  attraction: { badge: 'A', fill: '#7b6ad9', stroke: '#4e42a1' },
  other: { badge: 'O', fill: '#6f5947', stroke: '#43352c' },
} as const;
const venueFilters = [
  { label: 'Restaurant', value: 'restaurant' },
  { label: 'Bar', value: 'bar' },
  { label: 'Fast Food', value: 'fast_food' },
  { label: 'Cafe', value: 'cafe' },
  { label: 'Shop', value: 'shop' },
  { label: 'Attraction', value: 'attraction' },
  { label: 'Other', value: 'other' },
] as const;
const manualBusinessCityOptions = cityFilters.filter((filter) => filter.value !== 'all');
const manualBusinessVenueOptions = venueFilters;

type BrowseMode = 'list' | 'map';
type VenueFilterValue = (typeof venueFilters)[number]['value'];
type AppScreenMode = 'splash' | 'auth' | 'browse' | 'profiles' | 'business-search' | 'business-claim' | 'manual-business-claim';
type AuthPortal = 'customer' | 'business';
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

type BrowseControlsProps = {
  overlay?: boolean;
  browseMode: BrowseMode;
  filtersExpanded: boolean;
  onBrowseModeChange: (mode: BrowseMode) => void;
  onChangeSearchQuery: (value: string) => void;
  onClearSearchQuery: () => void;
  onOpenDashboard?: () => void;
  onReload: () => void;
  onSelectAllVenueTypes: () => void;
  onSelectCity: (city: CityFilterValue) => void;
  onToggleFilters: () => void;
  onToggleVenueType: (venueType: VenueFilterValue) => void;
  resultCount: number;
  searchQuery: string;
  selectedCity: CityFilterValue;
  selectedVenueTypes: VenueFilterValue[];
};

type ProfileFormState = {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  business_slug: string;
  business_name: string;
  business_city: string;
  business_venue_type: string;
  business_website_url: string;
  contact_name: string;
  job_title: string;
  work_email: string;
  work_phone: string;
  employer_address: string;
  address_not_applicable: boolean;
  verification_summary: string;
  supporting_details: string;
};

type LoginFormState = {
  identifier: string;
  password: string;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<(typeof cityFilters)[number]['value']>('all');
  const [selectedVenueTypes, setSelectedVenueTypes] = useState<VenueFilterValue[]>(() => venueFilters.map((filter) => filter.value));
  const [places, setPlaces] = useState<PlaceListItem[]>([]);
  const [selectedPlaceSlug, setSelectedPlaceSlug] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetail | null>(null);
  const [selectedMapPlaceKey, setSelectedMapPlaceKey] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>(() => clampRegionToBounds(defaultMapRegion));
  const [reloadCount, setReloadCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showMapResultsCard, setShowMapResultsCard] = useState(false);
  const [renderedMapSearchResults, setRenderedMapSearchResults] = useState<MappedPlace[]>([]);
  const [renderedMapResultsKey, setRenderedMapResultsKey] = useState('');
  const [renderedMapResultCount, setRenderedMapResultCount] = useState(0);
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
  const shouldUseNativeMapBoundaries = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = normalizeSearchText(deferredSearchQuery);
  const onboardingTransitionDuration = 480;
  const showMapBrowse = screenMode === 'browse' && !selectedPlaceSlug && browseMode === 'map';

  const filteredPlaces = getFilteredPlaces(places, selectedVenueTypes, normalizedSearchQuery);
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
  const selectedPlaceMapRegion = getPlacePreviewRegion(selectedPlaceLocation ?? selectedPlace);
  const mapSearchResults = normalizedSearchQuery.length ? displayedMapPlaces.slice(0, 5) : [];
  const mapSearchResultsKey = mapSearchResults.map((place) => place.markerKey).join('|');
  const mapOverlayBottomPadding = keyboardHeight > 0
    ? Math.max(keyboardHeight - insets.bottom, 0) + 12
    : Math.max(insets.bottom + 12, 20);
  const availableProfilePlaces = profilePlaces.length ? profilePlaces : places;
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
  const businessSearchResults = normalizedBusinessSearchQuery.length
    ? availableProfilePlaces
      .map((place) => ({ place, score: getPlaceSearchScore(place, normalizedBusinessSearchQuery) }))
      .filter(({ score }) => score > 0)
      .sort((first, second) => second.score - first.score)
      .map(({ place }) => place)
      .slice(0, 12)
    : [];

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
        setRenderedMapSearchResults(mapSearchResults);
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
    });
  }, [
    filteredPlaces.length,
    mapResultsOpacity,
    mapSearchResults,
    mapSearchResultsKey,
    renderedMapResultCount,
    renderedMapResultsKey,
    shouldShowMapResults,
    showMapResultsCard,
  ]);

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
    }).start();
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

  function handleBrowseModeChange(mode: BrowseMode) {
    if (mode === browseMode) {
      return;
    }

    animateNextLayout();
    setBrowseFiltersExpanded(false);
    setSelectedMapPlaceKey(null);
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

  function handleSelectClaimBusiness(place: PlaceListItem) {
    dismissKeyboardForScreenTransition();
    setSelectedClaimPlace(place);
    setProfileForm((current) => ({
      ...current,
      business_slug: place.slug,
      business_name: place.name,
      business_city: place.city,
      business_venue_type: place.venue_type,
      business_website_url: place.website_url,
      address_not_applicable: false,
    }));
    navigateScreen('business-claim', 'forward');
  }

  function handleClearMapSelection() {
    setSelectedMapPlaceKey(null);
  }

  function handleFocusMapResult(place: MappedPlace) {
    setSelectedMapPlaceKey(place.markerKey);
    const nextRegion = clampRegionToBounds({
      latitude: place.latitude,
      longitude: place.longitude,
      latitudeDelta: Math.min(mapRegion.latitudeDelta, 0.04),
      longitudeDelta: Math.min(mapRegion.longitudeDelta, 0.04),
    });

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
        <View style={[styles.detailScreen, isLandscape ? styles.detailScreenLandscape : null]}>
          <ScrollView
            contentContainerStyle={[styles.detailScrollContent, isLandscape ? styles.detailScrollContentLandscape : null]}
            showsVerticalScrollIndicator={false}
          >
            <Pressable onPress={handleBackToBrowse} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back to places</Text>
            </Pressable>

            {detailLoading && !selectedPlace ? (
              <View style={styles.centerState}>
                <ActivityIndicator color="#c65d1f" size="large" />
                <Text style={styles.centerStateText}>Loading place details...</Text>
              </View>
            ) : null}

            {selectedPlace ? (
              <View style={[styles.detailCard, isLandscape ? styles.detailCardLandscape : null]}>
                <Text style={styles.detailCity}>{selectedPlaceLocation?.city_label ?? selectedPlace.city_label}</Text>
                <Text style={styles.detailTitle}>{selectedPlace.name}</Text>
                <Text style={styles.detailMeta}>{selectedPlace.venue_type_label}</Text>
                {selectedPlace.locations.length ? (
                  <>
                    <Text style={[styles.sectionTitle, styles.locationsSectionTitle]}>
                      {selectedPlace.locations.length === 1 ? 'Location' : 'Locations'}
                    </Text>
                    <View style={styles.filterRow}>
                      {selectedPlace.locations.map((location) => {
                        const isActive = location.id === selectedPlaceLocation?.id;

                        return (
                          <Pressable
                            key={location.id}
                            onPress={() => setSelectedLocationId(location.id)}
                            style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                          >
                            <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                              {location.city_label} - {location.address_line_1}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
                <Pressable onPress={() => void openMapsAddress(selectedPlaceLocation ?? selectedPlace)} style={styles.addressButton}>
                  <Text selectable style={styles.detailLinkText}>{formatPlaceAddress(selectedPlaceLocation ?? selectedPlace)}</Text>
                </Pressable>

                {(selectedPlaceLocation?.phone_number ?? selectedPlace.phone_number) ? (
                  <Text selectable style={styles.detailMeta}>Phone: {selectedPlaceLocation?.phone_number ?? selectedPlace.phone_number}</Text>
                ) : null}

                {selectedPlaceMapRegion ? (
                  <Pressable
                    onPress={() => void openMapsAddress(selectedPlaceLocation ?? selectedPlace)}
                    style={styles.detailMapCard}
                  >
                    <MapView
                      region={selectedPlaceMapRegion}
                      pointerEvents="none"
                      rotateEnabled={false}
                      scrollEnabled={false}
                      style={styles.detailMap}
                      zoomEnabled={false}
                    >
                      <Marker
                        coordinate={{
                          latitude: selectedPlaceMapRegion.latitude,
                          longitude: selectedPlaceMapRegion.longitude,
                        }}
                        tracksViewChanges={false}
                      />
                    </MapView>
                    <View style={styles.detailMapCaption}>
                      <Text style={styles.detailMapCaptionText}>Tap to open in Maps</Text>
                    </View>
                  </Pressable>
                ) : null}

                {(selectedPlaceLocation?.website_url ?? selectedPlace.website_url) ? (
                  <Pressable onPress={() => void Linking.openURL(selectedPlaceLocation?.website_url ?? selectedPlace.website_url)} style={styles.linkButton}>
                    <Text style={styles.linkButtonText}>Open website</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => void Linking.openURL(buildGoogleReviewsUrl(selectedPlaceLocation ?? selectedPlace))}
                  style={styles.linkButtonSecondary}
                >
                  <Text style={styles.linkButtonSecondaryText}>View Google Reviews</Text>
                </Pressable>

                {selectedPlaceOperatingHours.length ? (
          <>
            <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Hours of Operations</Text>
            <View style={styles.hourList}>
              {formatOperatingHourGroups(selectedPlaceOperatingHours).map((group) => (
                <View key={group.id} style={styles.hourGroupCard}>
                  <Text style={styles.hourGroupDays}>{group.dayLabel}</Text>
                  <Text style={styles.hourRow}>{group.timeLabel}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Current Deals</Text>

                {selectedPlaceDeals.length ? (
                  selectedPlaceDeals.map((deal) => (
                    <View key={deal.id} style={styles.dealCard}>
                      <View style={styles.dealHeaderRow}>
                        <Text style={styles.dealTitle}>{deal.title}</Text>
                        <View style={styles.pill}>
                          <Text style={styles.pillText}>{deal.deal_type_label}</Text>
                        </View>
                      </View>
                      {deal.price_text ? <Text style={styles.dealPrice}>{deal.price_text}</Text> : null}
                      {deal.description ? <Text style={styles.dealDescription}>{deal.description}</Text> : null}
                      {deal.terms ? <Text style={styles.dealTerms}>Terms: {deal.terms}</Text> : null}
                      <View style={styles.hourList}>
                        {formatHappyHourGroups(deal.happy_hours, selectedPlaceOperatingHours).map((group) => (
                          <View key={group.id} style={styles.hourGroupCard}>
                            <Text style={styles.hourGroupDays}>{group.dayLabel}</Text>
                            <Text style={styles.hourRow}>{group.timeLabel}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyStateText}>No active deals were returned for this place yet.</Text>
                )}
              </View>
            ) : null}
          </ScrollView>
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </View>
        </SafeAreaView>
        </Animated.View>
        </View>
      ) : showMapBrowse ? (
        <View style={styles.fullScreenRoot}>
        <Animated.View style={[styles.screenTransitionLayerAbsolute, styles.fullScreenRoot, screenTransitionStyle, browseSceneTransitionStyle, browseModeTransitionStyle]}>
        <View style={styles.fullScreenRoot}>
        <View style={styles.mapScreen}>
          <MapView
            initialRegion={mapRegion}
            maxDelta={maxLatitudeDelta}
            minDelta={minLatitudeDelta}
            onMapReady={() => {
              if (!shouldUseNativeMapBoundaries || !mapRef.current) {
                return;
              }

              mapRef.current.setMapBoundaries(
                { latitude: mapAreaBounds.maxLatitude, longitude: mapAreaBounds.maxLongitude },
                { latitude: mapAreaBounds.minLatitude, longitude: mapAreaBounds.minLongitude },
              );
              mapRef.current.animateToRegion(mapRegion, 0);
            }}
            onRegionChangeComplete={(nextRegion) => {
              const boundedRegion = clampRegionToBounds(nextRegion);

              setMapRegion((currentRegion) => (
                areRegionsEqual(currentRegion, boundedRegion) ? currentRegion : boundedRegion
              ));
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

            <View
              pointerEvents="box-none"
              style={[
                styles.mapOverlayLayer,
                {
                  paddingTop: Math.max(insets.top + 12, 24),
                  paddingBottom: mapOverlayBottomPadding,
                },
              ]}
            >
            <BrowseControls
              overlay
              browseMode={browseMode}
              filtersExpanded={browseFiltersExpanded}
              onBrowseModeChange={handleBrowseModeChange}
              onChangeSearchQuery={setSearchQuery}
              onClearSearchQuery={handleClearSearchQuery}
              onOpenDashboard={authenticatedSession ? handleOpenProfiles : undefined}
              onReload={handleRefreshPlaces}
              onSelectAllVenueTypes={handleSelectAllVenueTypes}
              onSelectCity={setSelectedCity}
              onToggleFilters={handleToggleBrowseFilters}
              onToggleVenueType={handleToggleVenueType}
              resultCount={filteredPlaces.length}
              searchQuery={searchQuery}
              selectedCity={selectedCity}
              selectedVenueTypes={selectedVenueTypes}
            />

            <BrowseModeSwitcher browseMode={browseMode} onBrowseModeChange={handleBrowseModeChange} overlay />

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
              <Animated.View style={[styles.mapResultsCard, { opacity: mapResultsOpacity }]}>
                <View style={styles.mapResultsHeader}>
                  <Text style={styles.mapResultsTitle}>Best matches</Text>
                  <Text style={styles.mapResultsMeta}>{renderedMapResultCount} in view</Text>
                </View>
                {renderedMapSearchResults.length ? (
                  <View style={styles.mapResultsList}>
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
                  </View>
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
          </View>
        </View>
        </View>
        </Animated.View>
        </View>
      ) : (
        <View style={styles.fullScreenRoot}>
        <Animated.View style={[styles.screenTransitionLayerAbsolute, screenTransitionStyle, browseSceneTransitionStyle, browseModeTransitionStyle]}>
        <SafeAreaView style={styles.safeArea}>
        <View style={[styles.screen, isLandscape ? styles.screenLandscape : null]}>
          <>
            <BrowseControls
              browseMode={browseMode}
              filtersExpanded={browseFiltersExpanded}
              onBrowseModeChange={handleBrowseModeChange}
              onChangeSearchQuery={setSearchQuery}
              onClearSearchQuery={handleClearSearchQuery}
              onOpenDashboard={authenticatedSession ? handleOpenProfiles : undefined}
              onReload={handleRefreshPlaces}
              onSelectAllVenueTypes={handleSelectAllVenueTypes}
              onSelectCity={setSelectedCity}
              onToggleFilters={handleToggleBrowseFilters}
              onToggleVenueType={handleToggleVenueType}
              resultCount={filteredPlaces.length}
              searchQuery={searchQuery}
              selectedCity={selectedCity}
              selectedVenueTypes={selectedVenueTypes}
            />

            <BrowseModeSwitcher browseMode={browseMode} onBrowseModeChange={handleBrowseModeChange} />

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
                numColumns={browseListColumns}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelectPlace(item)}
                    style={[styles.placeCard, browseListColumns > 1 ? styles.placeCardLandscape : null]}
                  >
                    <Text style={styles.placeCity}>{getPlaceCardEyebrow(item)}</Text>
                    <Text style={styles.placeTitle}>{item.name}</Text>
                    <Text style={styles.placeMeta}>{item.venue_type_label}</Text>
                    <Text style={styles.placeAddress}>{getPlaceCardAddress(item)}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={<Text style={styles.emptyStateText}>{getBrowseEmptyStateMessage(normalizedSearchQuery)}</Text>}
                showsVerticalScrollIndicator={false}
              />
            )}
          </>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </View>
        </SafeAreaView>
        </Animated.View>
        </View>
      )}
    </>
  );
}

function BrowseControls({
  overlay = false,
  browseMode,
  filtersExpanded,
  onBrowseModeChange,
  onChangeSearchQuery,
  onClearSearchQuery,
  onOpenDashboard,
  onReload,
  onSelectAllVenueTypes,
  onSelectCity,
  onToggleFilters,
  onToggleVenueType,
  resultCount,
  searchQuery,
  selectedCity,
  selectedVenueTypes,
}: BrowseControlsProps) {
  const { height, width } = useWindowDimensions();
  const compactLandscapeControls = width > height && width >= 760;
  const landscapeControlsWidth = compactLandscapeControls
    ? Math.min(width - 32, overlay ? 560 : 620)
    : null;
  const chipStyle = overlay ? styles.overlayChip : styles.filterChip;
  const chipActiveStyle = overlay ? styles.overlayChipActive : styles.filterChipActive;
  const chipTextStyle = overlay ? styles.overlayChipText : styles.filterChipText;
  const chipTextActiveStyle = overlay ? styles.overlayChipTextActive : styles.filterChipTextActive;

  return (
    <View
      style={[
        overlay ? styles.mapTopPanel : styles.browseHeaderCard,
        compactLandscapeControls ? (overlay ? styles.mapTopPanelLandscape : styles.browseHeaderCardLandscape) : null,
        landscapeControlsWidth ? { width: landscapeControlsWidth } : null,
      ]}
    >
      <View style={[styles.toolbarRow, compactLandscapeControls ? styles.toolbarRowLandscape : null]}>
        <Text
          style={[
            overlay ? styles.mapAppTitle : styles.appTitle,
            compactLandscapeControls ? styles.controlsTitleLandscape : null,
          ]}
        >
          HappyHourApp
        </Text>
        <View style={styles.toolbarActionsRow}>
          {onOpenDashboard ? (
            <Pressable onPress={onOpenDashboard} style={styles.secondaryToolbarButton}>
              <Text style={styles.secondaryToolbarButtonText}>Back to Dashboard</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onReload} style={styles.reloadButton}>
            <Text style={styles.reloadButtonText}>Refresh Places</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.searchRow, compactLandscapeControls ? styles.searchRowLandscape : null]}>
        <View
          style={[
            styles.searchInputShell,
            overlay ? styles.searchInputShellOverlay : null,
            compactLandscapeControls ? styles.searchInputShellLandscape : null,
          ]}
        >
          <Text style={styles.searchInputIcon}>Find</Text>
          <TextInput
            onChangeText={onChangeSearchQuery}
            placeholder="Search restaurants, bars, etc."
            placeholderTextColor="#9a7f6c"
            style={styles.searchInput}
            value={searchQuery}
          />
          {searchQuery.length ? (
            <Pressable hitSlop={8} onPress={onClearSearchQuery} style={styles.searchClearButton}>
              <Text style={styles.searchClearButtonText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={onToggleFilters}
          style={[
            styles.filtersToggleButton,
            compactLandscapeControls ? styles.filtersToggleButtonLandscape : null,
            filtersExpanded ? styles.filtersToggleButtonActive : null,
          ]}
        >
          <Text style={[styles.filtersToggleText, filtersExpanded ? styles.filtersToggleTextActive : null]}>
            {filtersExpanded ? 'Hide filters' : 'Filters'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.browseStatsRow, compactLandscapeControls ? styles.browseStatsRowLandscape : null]}>
        <Text style={styles.browseStatsText}>{resultCount} {resultCount === 1 ? 'place' : 'places'}</Text>
        <Text numberOfLines={1} style={styles.browseStatsSubtleText}>
          {getBrowseSummaryLabel(selectedCity, selectedVenueTypes, normalizeSearchText(searchQuery))}
        </Text>
      </View>

      {filtersExpanded ? (
        <View style={[styles.filtersPanel, compactLandscapeControls ? styles.filtersPanelLandscape : null]}>
          <View style={styles.browseSectionHeaderRow}>
            <Text style={styles.browseSectionTitle}>City</Text>
            <Text style={styles.browseSectionMeta}>Quick scope</Text>
          </View>
          <View style={styles.filterRow}>
            {cityFilters.map((filter) => {
              const isActive = filter.value === selectedCity;

              return (
                <Pressable
                  key={filter.value}
                  onPress={() => onSelectCity(filter.value)}
                  style={[chipStyle, isActive ? chipActiveStyle : null]}
                >
                  <Text style={[chipTextStyle, isActive ? chipTextActiveStyle : null]}>{filter.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            contentContainerStyle={styles.venueFilterRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <Pressable
              onPress={onSelectAllVenueTypes}
              style={[chipStyle, selectedVenueTypes.length === venueFilters.length ? chipActiveStyle : null]}
            >
              <Text style={[chipTextStyle, selectedVenueTypes.length === venueFilters.length ? chipTextActiveStyle : null]}>All types</Text>
            </Pressable>
            {venueFilters.map((filter) => {
              const isActive = selectedVenueTypes.includes(filter.value);
              const markerStyle = getVenueMarkerStyle(filter.value);

              return (
                <Pressable
                  key={filter.value}
                  onPress={() => onToggleVenueType(filter.value)}
                  style={[styles.venueFilterChip, isActive ? styles.venueFilterChipActive : null]}
                >
                  <View style={[styles.venueFilterBadge, { backgroundColor: markerStyle.fill, borderColor: markerStyle.stroke }]}> 
                    <Text style={styles.venueFilterBadgeText}>{markerStyle.badge}</Text>
                  </View>
                  <Text style={[chipTextStyle, isActive ? chipTextActiveStyle : null]}>{filter.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

        </View>
      ) : null}
    </View>
  );
}

function BrowseModeSwitcher({ browseMode, onBrowseModeChange, overlay = false }: { browseMode: BrowseMode; onBrowseModeChange: (mode: BrowseMode) => void; overlay?: boolean }) {
  return (
    <View style={[styles.modeSwitcherDock, overlay ? styles.modeSwitcherDockOverlay : null]}>
      <View style={styles.modeSwitcherCard}>
        <Pressable
          onPress={() => onBrowseModeChange('list')}
          style={[styles.modeButton, browseMode === 'list' ? styles.modeButtonActive : null]}
        >
          <Text style={[styles.modeButtonText, browseMode === 'list' ? styles.modeButtonTextActive : null]}>List</Text>
        </Pressable>
        <Pressable
          onPress={() => onBrowseModeChange('map')}
          style={[styles.modeButton, browseMode === 'map' ? styles.modeButtonActive : null]}
        >
          <Text style={[styles.modeButtonText, browseMode === 'map' ? styles.modeButtonTextActive : null]}>Map</Text>
        </Pressable>
      </View>
    </View>
  );
}

function getAnimatedMapMarkerStyle(
  place: MappedPlace,
  region: Region,
  width: number,
  height: number,
  transition: Animated.Value,
) {
  const distance = getMarkerCenterScreenDistance(place, region, width, height);
  const maxDistance = Math.max(Math.hypot(width / 2, height / 2), 1);
  const delayStart = Math.min((distance / maxDistance) * 0.52, 0.72);
  const delayEnd = Math.min(delayStart + 0.22, 1);
  const offsetX = getMarkerOffsetFromCenterX(place, region, width);
  const offsetY = getMarkerOffsetFromCenterY(place, region, height);

  return {
    opacity: transition.interpolate({
      inputRange: [0, delayStart, delayEnd, 1],
      outputRange: [0, 0, 1, 1],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateX: transition.interpolate({
          inputRange: [0, delayStart, delayEnd, 1],
          outputRange: [offsetX * -0.22, offsetX * -0.12, 0, 0],
          extrapolate: 'clamp',
        }),
      },
      {
        translateY: transition.interpolate({
          inputRange: [0, delayStart, delayEnd, 1],
          outputRange: [offsetY * -0.22, offsetY * -0.12, 0, 0],
          extrapolate: 'clamp',
        }),
      },
      {
        scale: transition.interpolate({
          inputRange: [0, delayStart, delayEnd, 1],
          outputRange: [0.3, 0.48, 1, 1],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
}

function formatTime(value: string) {
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

function isCloseLabel(endTime: string, weekdays: number[], operatingHours: OperatingHourWindow[]) {
  if (endTime === '23:59') {
    return true;
  }

  if (!operatingHours.length) {
    return false;
  }

  const closeTimesByWeekday = new Map<number, string>(
    operatingHours.map((operatingHour) => [operatingHour.weekday, operatingHour.close_time]),
  );

  return weekdays.every((weekday) => closeTimesByWeekday.get(weekday) === endTime);
}


type AuthPortalScreenProps = {
  authMessage: string | null;
  errorMessage: string | null;
  loginForm: LoginFormState;
  loginPortal: AuthPortal;
  onChangeField: (field: keyof LoginFormState, value: string) => void;
  onContinueToApp: () => void;
  onOpenProfiles: () => void;
  onSelectPortal: (portal: AuthPortal) => void;
  onSubmit: () => void;
  submitting: boolean;
};

type CreateProfileScreenProps = {
  errorMessage: string | null;
  form: ProfileFormState;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onChangeField: (field: keyof ProfileFormState, value: string) => void;
  onOpenBusinessClaim: () => void;
  onSubmit: () => void;
  submitting: boolean;
};

type BusinessSearchScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  loadingPlaces: boolean;
  onBack: () => void;
  onChangeSearchQuery: (value: string) => void;
  onChooseManualBusiness: () => void;
  onSelectBusiness: (place: PlaceListItem) => void;
  results: PlaceListItem[];
  searchQuery: string;
};

type BusinessVerificationScreenProps = {
  errorMessage: string | null;
  form: ProfileFormState;
  isLandscape: boolean;
  mode: 'claimed' | 'manual';
  onBack: () => void;
  onChangeField: (field: keyof ProfileFormState, value: string) => void;
  onToggleAddressNotApplicable: (value: boolean) => void;
  onSubmit: () => void;
  selectedPlace: PlaceListItem | null;
  submitting: boolean;
};

type DashboardScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  loading: boolean;
  message: string | null;
  onBack: () => void;
  onLogout: () => void;
  onOpenBilling: () => void;
  onOpenPlaces: () => void;
  onRefresh: () => void;
  onResendVerification: () => void;
  onToggleTwoFactor: () => void;
  session: SignupResponse;
  submitting: boolean;
};

type CompactDropdownProps = {
  onSelect: (value: string) => void;
  open: boolean;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder: string;
  selectedValue: string;
  onToggle: () => void;
};

function SplashScreen() {
  return (
    <View style={styles.splashScreen}>
      <View style={styles.splashLogoShell}>
        <Text style={styles.splashLogoText}>HH</Text>
      </View>
      <Text style={styles.splashTitle}>HappyHourApp</Text>
      <Text style={styles.splashSubtitle}>Find your next deal or claim your business profile.</Text>
    </View>
  );
}

function KeyboardAwareFormScreen({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoidingFill}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

function CompactDropdown({ onSelect, open, options, placeholder, selectedValue, onToggle }: CompactDropdownProps) {
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? placeholder;

  function animateDropdownLayout() {
    LayoutAnimation.configureNext({
      duration: 180,
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

  function handleToggle() {
    animateDropdownLayout();
    onToggle();
  }

  function handleSelect(value: string) {
    animateDropdownLayout();
    onSelect(value);
  }

  return (
    <View style={styles.compactDropdownWrap}>
      <Pressable onPress={handleToggle} style={[styles.compactDropdownButton, open ? styles.compactDropdownButtonOpen : null]}>
        <Text style={[styles.compactDropdownText, selectedValue.length === 0 ? styles.compactDropdownPlaceholder : null]}>{selectedLabel}</Text>
        <Text style={styles.compactDropdownCaret}>{open ? '^' : 'v'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.compactDropdownMenu}>
          {options.map((option) => {
            const isSelected = option.value === selectedValue;

            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelect(option.value)}
                style={[styles.compactDropdownOption, isSelected ? styles.compactDropdownOptionSelected : null]}
              >
                <Text style={[styles.compactDropdownOptionText, isSelected ? styles.compactDropdownOptionTextSelected : null]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function AuthPortalScreen({ authMessage, errorMessage, loginForm, loginPortal, onChangeField, onContinueToApp, onOpenProfiles, onSelectPortal, onSubmit, submitting }: AuthPortalScreenProps) {
  return (
    <View style={styles.authScreen}>
      <KeyboardAwareFormScreen>
      <ScrollView
        contentContainerStyle={styles.authScrollContent}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.authHero}>
          <View style={styles.authLogoShell}>
            <Text style={styles.authLogoText}>HH</Text>
          </View>
          <Text style={styles.authTitle}>Welcome back</Text>
          <Text style={styles.authSubtitle}>Choose a customer or business portal to continue.</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.modeRow}>
            <Pressable onPress={() => onSelectPortal('customer')} style={[styles.modeButton, loginPortal === 'customer' ? styles.modeButtonActive : null]}>
              <Text style={[styles.modeButtonText, loginPortal === 'customer' ? styles.modeButtonTextActive : null]}>Customer</Text>
            </Pressable>
            <Pressable onPress={() => onSelectPortal('business')} style={[styles.modeButton, loginPortal === 'business' ? styles.modeButtonActive : null]}>
              <Text style={[styles.modeButtonText, loginPortal === 'business' ? styles.modeButtonTextActive : null]}>Business</Text>
            </Pressable>
          </View>

          {authMessage ? (
            <View style={styles.profileSuccessBanner}>
              <Text style={styles.profileSuccessText}>{authMessage}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <Text style={styles.profileFieldLabel}>Username or email</Text>
          <TextInput autoCapitalize="none" onChangeText={(value) => onChangeField('identifier', value)} style={styles.profileInput} value={loginForm.identifier} />

          <Text style={styles.profileFieldLabel}>Password</Text>
          <TextInput onChangeText={(value) => onChangeField('password', value)} secureTextEntry style={styles.profileInput} value={loginForm.password} />

          <Pressable onPress={() => void onSubmit()} style={[styles.linkButton, submitting ? styles.linkButtonDisabled : null]}>
            <Text style={styles.linkButtonText}>{submitting ? 'Logging in...' : loginPortal === 'customer' ? 'Log in as customer' : 'Log in as business'}</Text>
          </Pressable>

          <Pressable onPress={onContinueToApp} style={styles.linkButtonSecondaryWide}>
            <Text style={styles.linkButtonSecondaryText}>Continue to App</Text>
          </Pressable>

          <Pressable onPress={onOpenProfiles} style={styles.authLinkButton}>
            <Text style={styles.authLinkText}>Don&apos;t have an account? Create a free account here.</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

function CreateProfileScreen({ errorMessage, form, isLandscape, message, onBack, onChangeField, onOpenBusinessClaim, onSubmit, submitting }: CreateProfileScreenProps) {
  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
      <ScrollView
        contentContainerStyle={styles.profileScrollContent}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to login</Text>
        </Pressable>

        <View style={styles.profileCard}>
          <Text style={styles.detailCity}>Create Profile</Text>
          <Text style={styles.detailTitle}>Create a customer account</Text>
          <Text style={styles.profileIntroText}>Customer accounts now send an email verification link after signup and open into an in-app dashboard.</Text>

          {message ? (
            <View style={styles.profileSuccessBanner}>
              <Text style={styles.profileSuccessText}>{message}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.profileFormSection}>
            <Text style={styles.profileFieldLabel}>Username</Text>
            <TextInput autoCapitalize="none" onChangeText={(value) => onChangeField('username', value)} style={styles.profileInput} value={form.username} />

            <Text style={styles.profileFieldLabel}>Email</Text>
            <TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => onChangeField('email', value)} style={styles.profileInput} value={form.email} />

            <Text style={styles.profileFieldLabel}>Password</Text>
            <TextInput onChangeText={(value) => onChangeField('password', value)} secureTextEntry style={styles.profileInput} value={form.password} />

            <Text style={styles.profileFieldLabel}>First name</Text>
            <TextInput onChangeText={(value) => onChangeField('first_name', value)} style={styles.profileInput} value={form.first_name} />

            <Text style={styles.profileFieldLabel}>Last name</Text>
            <TextInput onChangeText={(value) => onChangeField('last_name', value)} style={styles.profileInput} value={form.last_name} />
          </View>

          <Pressable onPress={() => void onSubmit()} style={[styles.linkButton, submitting ? styles.linkButtonDisabled : null]}>
            <Text style={styles.linkButtonText}>{submitting ? 'Submitting...' : 'Create customer profile'}</Text>
          </Pressable>

          <Pressable onPress={onOpenBusinessClaim} style={styles.linkButtonSecondaryWide}>
            <Text style={styles.linkButtonSecondaryText}>Claim a Business</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

function DashboardScreen({ errorMessage, isLandscape, loading, message, onBack, onLogout, onOpenBilling, onOpenPlaces, onRefresh, onResendVerification, onToggleTwoFactor, session, submitting }: DashboardScreenProps) {
  const approvedBusinesses = session.approved_businesses ?? [];
  const businessContact = session.business_contact ?? {};
  const fullName = [session.first_name, session.last_name].filter(Boolean).join(' ');

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <ScrollView contentContainerStyle={styles.dashboardScrollContent} showsVerticalScrollIndicator={false}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to places</Text>
        </Pressable>

        <View style={styles.dashboardCard}>
          <Text style={styles.detailCity}>{session.profile_type === 'business' ? 'Business Dashboard' : 'Customer Dashboard'}</Text>
          <Text style={styles.detailTitle}>{fullName || session.username}</Text>
          <Text style={styles.profileIntroText}>Use this dashboard to manage your account, check verification status, and jump back into the main app.</Text>

          {message ? (
            <View style={styles.profileSuccessBanner}>
              <Text style={styles.profileSuccessText}>{message}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color="#c65d1f" size="large" />
              <Text style={styles.centerStateText}>Refreshing dashboard...</Text>
            </View>
          ) : null}

          {!session.email_verified ? (
            <View style={styles.dashboardCalloutCard}>
              <Text style={styles.dashboardSectionTitle}>Email verification</Text>
              <Text style={styles.dashboardSupportText}>Your email is not verified yet. Use the link sent to {session.email}, then refresh this dashboard.</Text>
              <Pressable onPress={onResendVerification} style={[styles.linkButtonSecondaryWide, submitting ? styles.linkButtonDisabled : null]}>
                <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Sending...' : 'Resend verification email'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.dashboardVerifiedCard}>
              <Text style={styles.dashboardVerifiedTitle}>Email verified</Text>
              <Text style={styles.dashboardVerifiedText}>Your account is verified and ready to use across the app.</Text>
            </View>
          )}

          <View style={styles.dashboardSectionCard}>
            <Text style={styles.dashboardSectionTitle}>Profile details</Text>
            <DashboardDetailRow label="Username" value={session.username} />
            <DashboardDetailRow label="Email" value={session.email} />
            <DashboardDetailRow label="First name" value={session.first_name || 'Not provided'} />
            <DashboardDetailRow label="Last name" value={session.last_name || 'Not provided'} />
            <DashboardDetailRow label="Profile type" value={session.profile_type === 'business' ? 'Business' : 'Customer'} />
          </View>

          <View style={styles.dashboardSectionCard}>
            <Text style={styles.dashboardSectionTitle}>Security</Text>
            <DashboardDetailRow label="Two-factor authentication" value={session.two_factor_enabled ? 'Enabled' : 'Disabled'} />
            <Text style={styles.dashboardSupportText}>Enable this preference now. Sign-in challenge enforcement can be expanded next.</Text>
            <Pressable onPress={onToggleTwoFactor} style={[styles.linkButtonSecondaryWide, submitting ? styles.linkButtonDisabled : null]}>
              <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Saving...' : session.two_factor_enabled ? 'Disable 2FA' : 'Enable 2FA'}</Text>
            </Pressable>
          </View>

          {session.profile_type === 'business' ? (
            <>
              <View style={styles.dashboardSectionCard}>
                <Text style={styles.dashboardSectionTitle}>Business status</Text>
                <DashboardDetailRow label="Status" value={session.business_status || 'Pending'} />
                <DashboardDetailRow label="Current business" value={session.business_name || 'No approved business yet'} />
                {session.claim_status ? <DashboardDetailRow label="Claim review" value={session.claim_status} /> : null}
              </View>

              {Object.values(businessContact).some(Boolean) ? (
                <View style={styles.dashboardSectionCard}>
                  <Text style={styles.dashboardSectionTitle}>Business contact details</Text>
                  <DashboardDetailRow label="Contact name" value={businessContact.contact_name || 'Not provided'} />
                  <DashboardDetailRow label="Job title" value={businessContact.job_title || 'Not provided'} />
                  <DashboardDetailRow label="Work email" value={businessContact.work_email || 'Not provided'} />
                  <DashboardDetailRow label="Work phone" value={businessContact.work_phone || 'Not provided'} />
                  <DashboardDetailRow label="Employer address" value={businessContact.employer_address || 'Not provided'} />
                </View>
              ) : null}

              <View style={styles.dashboardSectionCard}>
                <Text style={styles.dashboardSectionTitle}>Approved businesses</Text>
                {approvedBusinesses.length ? approvedBusinesses.map((business) => (
                  <View key={business.id} style={styles.claimResultCard}>
                    <Text style={styles.placeTitle}>{business.name}</Text>
                    <Text style={styles.placeMeta}>{business.city_label} • {business.venue_type_label}</Text>
                  </View>
                )) : (
                  <Text style={styles.dashboardSupportText}>Claimed or created businesses appear here after admin approval.</Text>
                )}
              </View>

              {session.billing_portal_url ? (
                <Pressable onPress={onOpenBilling} style={styles.linkButtonSecondaryWide}>
                  <Text style={styles.linkButtonSecondaryText}>Open billing in browser</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          <Pressable onPress={onOpenPlaces} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Open main app features</Text>
          </Pressable>

          <View style={styles.dashboardFooterRow}>
            <Pressable onPress={onRefresh} style={styles.secondaryToolbarButton}>
              <Text style={styles.secondaryToolbarButtonText}>Refresh dashboard</Text>
            </Pressable>
            <Pressable onPress={onLogout} style={styles.secondaryToolbarButton}>
              <Text style={styles.secondaryToolbarButtonText}>Log out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function DashboardDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dashboardDetailRow}>
      <Text style={styles.dashboardDetailLabel}>{label}</Text>
      <Text style={styles.dashboardDetailValue}>{value}</Text>
    </View>
  );
}

function BusinessSearchScreen({ errorMessage, isLandscape, loadingPlaces, onBack, onChangeSearchQuery, onChooseManualBusiness, onSelectBusiness, results, searchQuery }: BusinessSearchScreenProps) {
  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
      <ScrollView
        contentContainerStyle={styles.profileScrollContent}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to create profile</Text>
        </Pressable>

        <View style={styles.profileCard}>
          <Text style={styles.detailCity}>Claim a Business</Text>
          <Text style={styles.detailTitle}>Search your business</Text>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <TextInput placeholder="Search by business name" placeholderTextColor="#9a7f6c" onChangeText={onChangeSearchQuery} style={styles.profileInput} value={searchQuery} />

          {normalizeSearchText(searchQuery).length === 0 ? (
            <Text style={styles.centerStateText}>Start typing to search for your business.</Text>
          ) : loadingPlaces ? (
            <Text style={styles.centerStateText}>Loading businesses...</Text>
          ) : (
            <View style={styles.claimResultsList}>
              {results.length ? (
                results.map((place) => (
                  <Pressable key={place.slug} onPress={() => onSelectBusiness(place)} style={styles.claimResultCard}>
                    <Text style={styles.placeTitle}>{place.name}</Text>
                    <Text style={styles.placeMeta}>{place.venue_type_label}</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.centerStateText}>No matching businesses found yet.</Text>
              )}
            </View>
          )}

          <Pressable onPress={onChooseManualBusiness} style={styles.authLinkButton}>
            <Text style={styles.authLinkText}>Can&apos;t find your business? Create a business profile for it here.</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

function BusinessVerificationScreen({ errorMessage, form, isLandscape, mode, onBack, onChangeField, onToggleAddressNotApplicable, onSubmit, selectedPlace, submitting }: BusinessVerificationScreenProps) {
  const isManual = mode === 'manual';
  const [openDropdown, setOpenDropdown] = useState<'city' | 'venue' | null>(null);

  function handleSelectDropdownValue(field: 'business_city' | 'business_venue_type', value: string) {
    onChangeField(field, value);
    setOpenDropdown(null);
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
      <ScrollView
        contentContainerStyle={styles.profileScrollContent}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <View style={styles.profileCard}>
          <Text style={styles.detailCity}>Verification</Text>
          <Text style={styles.detailTitle}>{isManual ? 'Create a business profile' : 'Verify this business claim'}</Text>
          <Text style={styles.profileIntroText}>
            {isManual
              ? 'For upcoming or smaller businesses, some fields stay optional but recommended. Admin will review the submission in Django admin.'
              : 'Claimed businesses require full verification details before they move into admin review.'}
          </Text>

          {!isManual && selectedPlace ? (
            <View style={styles.claimResultCard}>
              <Text style={styles.placeTitle}>{selectedPlace.name}</Text>
              <Text style={styles.placeMeta}>{selectedPlace.venue_type_label}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.profileFormSection}>
            {isManual ? (
              <>
                <Text style={styles.profileFieldLabel}>Business name</Text>
                <TextInput onChangeText={(value) => onChangeField('business_name', value)} style={styles.profileInput} value={form.business_name} />

                <Text style={styles.profileFieldLabel}>City</Text>
                <CompactDropdown
                  onSelect={(value) => handleSelectDropdownValue('business_city', value)}
                  onToggle={() => setOpenDropdown((current) => current === 'city' ? null : 'city')}
                  open={openDropdown === 'city'}
                  options={[{ label: 'Select a city', value: '' }, ...manualBusinessCityOptions]}
                  placeholder="Select a city"
                  selectedValue={form.business_city}
                />

                <Text style={styles.profileFieldLabel}>Business type</Text>
                <CompactDropdown
                  onSelect={(value) => handleSelectDropdownValue('business_venue_type', value)}
                  onToggle={() => setOpenDropdown((current) => current === 'venue' ? null : 'venue')}
                  open={openDropdown === 'venue'}
                  options={[{ label: 'Select a business type', value: '' }, ...manualBusinessVenueOptions]}
                  placeholder="Select a business type"
                  selectedValue={form.business_venue_type}
                />

                <Text style={styles.profileFieldLabel}>Website URL (optional)</Text>
                <TextInput autoCapitalize="none" onChangeText={(value) => onChangeField('business_website_url', value)} style={styles.profileInput} value={form.business_website_url} />
              </>
            ) : null}

            <Text style={styles.profileFieldLabel}>Username</Text>
            <TextInput autoCapitalize="none" onChangeText={(value) => onChangeField('username', value)} style={styles.profileInput} value={form.username} />

            <Text style={styles.profileFieldLabel}>Email</Text>
            <TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => onChangeField('email', value)} style={styles.profileInput} value={form.email} />

            <Text style={styles.profileFieldLabel}>Password</Text>
            <TextInput onChangeText={(value) => onChangeField('password', value)} secureTextEntry style={styles.profileInput} value={form.password} />

            <Text style={styles.profileFieldLabel}>First name</Text>
            <TextInput onChangeText={(value) => onChangeField('first_name', value)} style={styles.profileInput} value={form.first_name} />

            <Text style={styles.profileFieldLabel}>Last name</Text>
            <TextInput onChangeText={(value) => onChangeField('last_name', value)} style={styles.profileInput} value={form.last_name} />

            <Text style={styles.profileFieldLabel}>Contact name</Text>
            <TextInput onChangeText={(value) => onChangeField('contact_name', value)} style={styles.profileInput} value={form.contact_name} />

            <Text style={styles.profileFieldLabel}>{isManual ? 'Job title (recommended)' : 'Job title'}</Text>
            <TextInput onChangeText={(value) => onChangeField('job_title', value)} style={styles.profileInput} value={form.job_title} />

            <Text style={styles.profileFieldLabel}>Work email</Text>
            <TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => onChangeField('work_email', value)} style={styles.profileInput} value={form.work_email} />

            <Text style={styles.profileFieldLabel}>{isManual ? 'Work phone (recommended)' : 'Work phone'}</Text>
            <TextInput onChangeText={(value) => onChangeField('work_phone', value)} style={styles.profileInput} value={form.work_phone} />

            <Text style={styles.profileFieldLabel}>{isManual ? 'Employer address or “Address Not Applicable”' : 'Employer address'}</Text>
            <TextInput onChangeText={(value) => onChangeField('employer_address', value)} style={styles.profileInput} value={form.employer_address} />

            {isManual ? (
              <Pressable onPress={() => onToggleAddressNotApplicable(!form.address_not_applicable)} style={[styles.toggleChip, form.address_not_applicable ? styles.toggleChipActive : null]}>
                <Text style={[styles.toggleChipText, form.address_not_applicable ? styles.toggleChipTextActive : null]}>Address Not Applicable</Text>
              </Pressable>
            ) : null}

            <Text style={styles.profileFieldLabel}>Verification summary</Text>
            <TextInput multiline onChangeText={(value) => onChangeField('verification_summary', value)} style={[styles.profileInput, styles.profileTextarea]} value={form.verification_summary} />

            <Text style={styles.profileFieldLabel}>{isManual ? 'Supporting details (recommended)' : 'Supporting details'}</Text>
            <TextInput multiline onChangeText={(value) => onChangeField('supporting_details', value)} style={[styles.profileInput, styles.profileTextarea]} value={form.supporting_details} />
          </View>

          <Pressable onPress={() => void onSubmit()} style={[styles.linkButton, submitting ? styles.linkButtonDisabled : null]}>
            <Text style={styles.linkButtonText}>{submitting ? 'Submitting...' : isManual ? 'Create business profile' : 'Submit business claim'}</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

function formatHappyHourGroups(happyHours: HappyHourWindow[], operatingHours: OperatingHourWindow[] = []) {
  const groupedHours = new Map<string, HappyHourWindow[]>();

  happyHours.forEach((happyHour) => {
    const key = `${happyHour.start_time}-${happyHour.end_time}-${happyHour.all_day}`;
    const existingGroup = groupedHours.get(key);

    if (existingGroup) {
      existingGroup.push(happyHour);
      return;
    }

    groupedHours.set(key, [happyHour]);
  });

  return Array.from(groupedHours.entries()).map(([key, group]) => {
    const weekdays = group.map((happyHour) => happyHour.weekday);
    const endLabel = isCloseLabel(group[0].end_time, weekdays, operatingHours)
      ? 'Close'
      : formatTime(group[0].end_time);

    return {
      id: key,
      dayLabel: formatWeekdayRanges(weekdays),
      timeLabel: group[0].all_day
        ? 'All day'
        : `${formatTime(group[0].start_time)} - ${endLabel}`,
    };
  });
}

function formatOperatingHourGroups(operatingHours: OperatingHourWindow[]) {
  const groupedHours = new Map<string, OperatingHourWindow[]>();

  operatingHours.forEach((operatingHour) => {
    const key = `${operatingHour.open_time}-${operatingHour.close_time}`;
    const existingGroup = groupedHours.get(key);

    if (existingGroup) {
      existingGroup.push(operatingHour);
      return;
    }

    groupedHours.set(key, [operatingHour]);
  });

  return Array.from(groupedHours.entries()).map(([key, group]) => ({
    id: key,
    dayLabel: formatWeekdayRanges(group.map((operatingHour) => operatingHour.weekday)),
    timeLabel: `${formatTime(group[0].open_time)} - ${formatTime(group[0].close_time)}`,
  }));
}

function formatWeekdayRanges(weekdayValues: number[]) {
  const orderedDays = Array.from(new Set(weekdayValues));

  if (!orderedDays.length) {
    return '';
  }

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const segments: string[] = [];
  let rangeStart = orderedDays[0];
  let previousDay = orderedDays[0];

  for (let index = 1; index < orderedDays.length; index += 1) {
    const day = orderedDays[index];
    if (day === ((previousDay + 1) % dayLabels.length)) {
      previousDay = day;
      continue;
    }

    segments.push(formatWeekdaySegment(rangeStart, previousDay, dayLabels));
    rangeStart = day;
    previousDay = day;
  }

  segments.push(formatWeekdaySegment(rangeStart, previousDay, dayLabels));
  return segments.join(', ');
}

function formatWeekdaySegment(startDay: number, endDay: number, dayLabels: string[]) {
  const startLabel = dayLabels[startDay] ?? '';
  const endLabel = dayLabels[endDay] ?? '';

  if (startDay === endDay) {
    return startLabel;
  }

  return `${startLabel}-${endLabel}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while talking to the backend.';
}

function formatPlaceAddress(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const lineOne = place.address_line_1;
  const lineTwo = place.address_line_2 ? `, ${place.address_line_2}` : '';
  return `${lineOne}${lineTwo}, ${place.city_label}, ${place.state} ${place.postal_code}`;
}

function dedupeImageUrls(imageUrls: string[]) {
  return Array.from(new Set(imageUrls.filter((imageUrl) => imageUrl.trim().length > 0)));
}

function getPlaceCardEyebrow(place: PlaceListItem) {
  const cityLabels = Array.from(new Set(getPlaceLocations(place).map((location) => location.city_label)));
  return cityLabels.join(' • ');
}

function getPlaceCardAddress(place: PlaceListItem) {
  const locations = getPlaceLocations(place);
  if (locations.length > 1) {
    return `${locations.length} locations`;
  }

  return formatPlaceAddress(locations[0] ?? place);
}

function getPlacePreviewRegion(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail | null) {
  if (!place || place.latitude === null || place.longitude === null) {
    return null;
  }

  return {
    latitude: place.latitude,
    longitude: place.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };
}

async function openMapsAddress(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const query = encodeURIComponent(formatPlaceAddress(place));
  await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
}

function buildGoogleReviewsUrl(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const query = encodeURIComponent(`${place.name} ${formatPlaceAddress(place)}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function getPlaceLocations(place: PlaceListItem | PlaceDetail) {
  return place.locations.length ? place.locations : [place];
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

function getFilteredPlaces(places: PlaceListItem[], selectedVenueTypes: VenueFilterValue[], searchQuery: string) {
  return places
    .map((place, index) => ({
      index,
      place,
      score: getPlaceSearchScore(place, searchQuery),
    }))
    .filter(({ place, score }) => (
      selectedVenueTypes.includes(place.venue_type as VenueFilterValue) && (searchQuery.length === 0 || score > 0)
    ))
    .sort((first, second) => {
      if (searchQuery.length === 0) {
        return first.index - second.index;
      }

      return second.score - first.score || first.place.name.localeCompare(second.place.name);
    })
    .map(({ place }) => place);
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

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getBrowseSummaryLabel(selectedCity: CityFilterValue, selectedVenueTypes: VenueFilterValue[], searchQuery: string) {
  const summaryParts: string[] = [];

  if (searchQuery.length) {
    summaryParts.push(`Search: ${searchQuery}`);
  }

  if (selectedCity !== 'all') {
    const cityLabel = cityFilters.find((filter) => filter.value === selectedCity)?.label ?? selectedCity;
    summaryParts.push(cityLabel);
  }

  if (selectedVenueTypes.length !== venueFilters.length) {
    summaryParts.push(`${selectedVenueTypes.length} types`);
  }

  return summaryParts.length ? summaryParts.join(' • ') : 'All cities • all venue types';
}

function getBrowseEmptyStateMessage(searchQuery: string) {
  if (searchQuery.length) {
    return 'No places matched that search and filter combination yet.';
  }

  return 'No places matched the current filters yet.';
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

function areRegionsEqual(first: Region, second: Region) {
  return (
    nearlyEqual(first.latitude, second.latitude) &&
    nearlyEqual(first.longitude, second.longitude) &&
    nearlyEqual(first.latitudeDelta, second.latitudeDelta) &&
    nearlyEqual(first.longitudeDelta, second.longitudeDelta)
  );
}

function nearlyEqual(first: number, second: number) {
  return Math.abs(first - second) < 0.0001;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getVenueMarkerStyle(venueType: string) {
  return venueMarkerStyles[venueType as keyof typeof venueMarkerStyles] ?? venueMarkerStyles.other;
}

const styles = StyleSheet.create({
  fullScreenRoot: {
    flex: 1,
    backgroundColor: '#f7efe2',
  },
  onboardingTransitionRoot: {
    flex: 1,
    backgroundColor: '#f7efe2',
    overflow: 'hidden',
  },
  screenTransitionLayer: {
    flex: 1,
    backgroundColor: '#f7efe2',
  },
  screenTransitionLayerAbsolute: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f7efe2',
  },
  incomingOnboardingOverlay: {
    shadowColor: '#2d221a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 12,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#f7efe2',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 14,
  },
  screenLandscape: {
    alignSelf: 'center',
    maxWidth: 1180,
    width: '100%',
  },
  detailScreen: {
    flex: 1,
    paddingHorizontal: 18,
  },
  detailScreenLandscape: {
    alignSelf: 'center',
    maxWidth: 1180,
    width: '100%',
  },
  browseHeaderCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  browseHeaderCardLandscape: {
    alignSelf: 'center',
    gap: 8,
    maxWidth: 620,
    padding: 12,
  },
  toolbarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toolbarActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolbarRowLandscape: {
    minHeight: 36,
  },
  appTitle: {
    color: '#2d221a',
    fontSize: 24,
    fontWeight: '800',
  },
  controlsTitleLandscape: {
    fontSize: 20,
  },
  mapScreen: {
    flex: 1,
  },
  mapBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 0,
  },
  mapTopPanel: {
    backgroundColor: 'rgba(247, 239, 226, 0.92)',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  mapTopPanelLandscape: {
    alignSelf: 'center',
    gap: 8,
    maxWidth: 560,
    padding: 12,
  },
  mapLoadingOverlay: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 250, 244, 0.94)',
    borderRadius: 20,
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  mapPreviewCard: {
    backgroundColor: 'rgba(255, 250, 244, 0.97)',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  mapPreviewCardLandscape: {
    alignSelf: 'center',
    gap: 10,
    maxWidth: 320,
    padding: 12,
    width: '100%',
  },
  mapResultsCard: {
    backgroundColor: 'rgba(255, 250, 244, 0.97)',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  mapResultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mapResultsTitle: {
    color: '#2d221a',
    fontSize: 18,
    fontWeight: '800',
  },
  mapResultsMeta: {
    color: '#7b6350',
    fontSize: 12,
    fontWeight: '700',
  },
  mapResultsList: {
    gap: 10,
  },
  mapResultRow: {
    alignItems: 'center',
    backgroundColor: '#fff7ef',
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mapResultCopy: {
    flex: 1,
    gap: 4,
  },
  mapResultTitle: {
    color: '#2d221a',
    fontSize: 15,
    fontWeight: '800',
  },
  mapResultMeta: {
    color: '#725947',
    fontSize: 12,
    lineHeight: 17,
  },
  mapResultAction: {
    color: '#1f5f5b',
    fontSize: 12,
    fontWeight: '800',
  },
  mapResultEmptyText: {
    color: '#725947',
    fontSize: 13,
    lineHeight: 18,
  },
  mapPreviewHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mapPreviewCopy: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  mapPreviewTitle: {
    color: '#2d221a',
    fontSize: 19,
    fontWeight: '800',
  },
  mapPreviewTitleLandscape: {
    fontSize: 16,
  },
  mapPreviewMeta: {
    color: '#6c5443',
    fontSize: 14,
    fontWeight: '600',
  },
  mapPreviewMetaLandscape: {
    fontSize: 12,
  },
  mapPreviewActions: {
    flexDirection: 'row',
    gap: 8,
  },
  mapPreviewDetails: {
    gap: 4,
    marginTop: -2,
  },
  mapPreviewDetailText: {
    color: '#725947',
    fontSize: 13,
    lineHeight: 18,
  },
  mapPreviewDetailTextLandscape: {
    fontSize: 12,
    lineHeight: 16,
  },
  mapPreviewIconButton: {
    alignItems: 'center',
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  mapPreviewIconButtonLandscape: {
    height: 30,
    width: 30,
  },
  mapPreviewIconText: {
    color: '#402214',
    fontSize: 18,
    fontWeight: '800',
  },
  mapPreviewIconTextLandscape: {
    fontSize: 15,
  },
  mapPreviewGallery: {
    gap: 12,
  },
  mapPreviewGalleryLandscape: {
    gap: 8,
  },
  mapPreviewImage: {
    backgroundColor: '#ecdac7',
    borderRadius: 18,
    height: 180,
    width: 250,
  },
  mapPreviewImageLandscape: {
    borderRadius: 14,
    height: 110,
    width: 180,
  },
  mapPreviewEmptyState: {
    alignItems: 'center',
    backgroundColor: '#f6eee4',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 140,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  mapPreviewEmptyStateLandscape: {
    minHeight: 92,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  mapPreviewEmptyText: {
    color: '#7d614f',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  mapPreviewEmptyTextLandscape: {
    fontSize: 12,
    lineHeight: 16,
  },
  mapAppTitle: {
    color: '#2d221a',
    fontSize: 24,
    fontWeight: '800',
  },
  mapOverlayText: {
    color: '#6c5443',
    fontSize: 13,
    lineHeight: 18,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  searchRowLandscape: {
    alignItems: 'stretch',
    gap: 6,
  },
  searchInputShell: {
    alignItems: 'center',
    backgroundColor: '#f8efe3',
    borderColor: '#ead6bf',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  searchInputShellLandscape: {
    minHeight: 42,
    paddingHorizontal: 10,
  },
  searchInputShellOverlay: {
    backgroundColor: 'rgba(248, 239, 227, 0.94)',
  },
  searchInputIcon: {
    color: '#9a6440',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  searchInput: {
    color: '#2d221a',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  searchClearButton: {
    paddingVertical: 6,
  },
  searchClearButtonText: {
    color: '#1f5f5b',
    fontSize: 13,
    fontWeight: '700',
  },
  filtersToggleButton: {
    alignItems: 'center',
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  filtersToggleButtonLandscape: {
    minHeight: 42,
    paddingHorizontal: 10,
  },
  filtersToggleButtonActive: {
    backgroundColor: '#402214',
    borderColor: '#402214',
  },
  filtersToggleText: {
    color: '#5d4637',
    fontSize: 13,
    fontWeight: '700',
  },
  filtersToggleTextActive: {
    color: '#fff7ef',
  },
  browseStatsRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  browseStatsRowLandscape: {
    gap: 6,
  },
  browseStatsText: {
    color: '#2d221a',
    fontSize: 14,
    fontWeight: '800',
  },
  browseStatsSubtleText: {
    color: '#7b6350',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  filtersPanel: {
    borderTopColor: '#efd8bd',
    borderTopWidth: 1,
    gap: 12,
    paddingTop: 12,
  },
  filtersPanelLandscape: {
    gap: 8,
    paddingTop: 8,
  },
  browseSectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  browseSectionTitle: {
    color: '#402214',
    fontSize: 14,
    fontWeight: '800',
  },
  browseSectionMeta: {
    color: '#8f725d',
    fontSize: 12,
    fontWeight: '600',
  },
  browseSectionAction: {
    color: '#1f5f5b',
    fontSize: 12,
    fontWeight: '700',
  },
  reloadButton: {
    backgroundColor: '#1f5f5b',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryToolbarButton: {
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryToolbarButtonText: {
    color: '#5d4637',
    fontSize: 14,
    fontWeight: '700',
  },
  reloadButtonText: {
    color: '#f4fffe',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#402214',
    fontSize: 18,
    fontWeight: '700',
  },
  detailSectionTitle: {
    marginTop: 22,
  },
  locationsSectionTitle: {
    paddingTop: 6,
    paddingBottom: 6,
  },
  filterRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeSwitcherDock: {
    alignItems: 'flex-start',
    marginTop: 10,
  },
  modeSwitcherDockOverlay: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  modeSwitcherCard: {
    backgroundColor: 'rgba(255, 250, 244, 0.96)',
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  modeButton: {
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modeButtonActive: {
    backgroundColor: '#1f5f5b',
    borderColor: '#1f5f5b',
  },
  modeButtonText: {
    color: '#5d4637',
    fontSize: 13,
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#f4fffe',
  },
  filterChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: '#402214',
    borderColor: '#402214',
  },
  filterChipText: {
    color: '#5d4637',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff7ef',
  },
  overlayChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 247, 239, 0.96)',
    borderColor: '#ddc4a7',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  overlayChipActive: {
    backgroundColor: '#402214',
    borderColor: '#402214',
  },
  overlayChipText: {
    color: '#5d4637',
    fontSize: 13,
    fontWeight: '600',
  },
  overlayChipTextActive: {
    color: '#fff7ef',
  },
  venueFilterRow: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 16,
  },
  venueFilterChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  venueFilterChipActive: {
    backgroundColor: '#402214',
    borderColor: '#402214',
  },
  venueFilterBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  venueFilterBadgeText: {
    color: '#fffaf4',
    fontSize: 11,
    fontWeight: '800',
  },
  mapMarker: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  mapMarkerActive: {
    borderWidth: 3,
    elevation: 4,
    shadowColor: '#1f160f',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  mapMarkerText: {
    color: '#fffaf4',
    fontSize: 12,
    fontWeight: '900',
  },
  listContent: {
    gap: 12,
    paddingBottom: 24,
  },
  listContentLandscape: {
    paddingBottom: 32,
  },
  placeCardColumn: {
    gap: 12,
  },
  placeCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd8bd',
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  placeCardLandscape: {
    flex: 1,
  },
  placeCity: {
    color: '#c65d1f',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  placeTitle: {
    color: '#2d221a',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  placeMeta: {
    color: '#5c5043',
    fontSize: 14,
    marginTop: 4,
  },
  placeAddress: {
    color: '#7d614f',
    fontSize: 13,
    marginTop: 8,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  centerStateText: {
    color: '#6f5947',
    marginTop: 10,
  },
  detailScrollContent: {
    paddingTop: 45,
    paddingBottom: 20,
  },
  detailScrollContentLandscape: {
    paddingTop: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ef',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#402214',
    fontWeight: '700',
  },
  linkButtonDisabled: {
    opacity: 0.7,
  },
  detailCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 12,
    padding: 18,
  },
  detailCardLandscape: {
    alignSelf: 'center',
    maxWidth: 980,
    width: '100%',
  },
  detailCity: {
    color: '#c65d1f',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  detailTitle: {
    color: '#2d221a',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 6,
  },
  detailMeta: {
    color: '#5f4b3d',
    fontSize: 14,
    marginTop: 6,
  },
  detailAddress: {
    color: '#7c6252',
    fontSize: 14,
    marginTop: 4,
  },
  addressButton: {
    alignSelf: 'flex-start',
  },
  detailLinkText: {
    color: '#1f5f5b',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  detailMapCard: {
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    overflow: 'hidden',
  },
  detailMap: {
    height: 170,
    width: '100%',
  },
  detailMapCaption: {
    backgroundColor: '#fff7ef',
    borderTopColor: '#efd8bd',
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  detailMapCaptionText: {
    color: '#5f4b3d',
    fontSize: 13,
    fontWeight: '600',
  },
  reviewSummaryCard: {
    backgroundColor: '#fff3e5',
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  reviewSummaryRating: {
    color: '#2d221a',
    fontSize: 18,
    fontWeight: '800',
  },
  reviewSummaryMeta: {
    color: '#6c5443',
    fontSize: 13,
    marginTop: 4,
  },
  reviewList: {
    gap: 12,
    marginTop: 12,
  },
  reviewCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  reviewQuote: {
    color: '#4d3a2f',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 21,
  },
  linkButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f5f5b',
    borderRadius: 14,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  linkButtonText: {
    color: '#effffd',
    fontWeight: '700',
  },
  linkButtonSecondary: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ef',
    borderColor: '#1f5f5b',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  linkButtonSecondaryText: {
    color: '#1f5f5b',
    fontWeight: '700',
  },
  dealCard: {
    backgroundColor: '#fff3e5',
    borderRadius: 18,
    marginTop: 14,
    padding: 14,
  },
  dealHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  dealTitle: {
    color: '#2f241b',
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  pill: {
    backgroundColor: '#f8d8bf',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: {
    color: '#7f461f',
    fontSize: 12,
    fontWeight: '700',
  },
  dealPrice: {
    color: '#bf4d0f',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  dealDescription: {
    color: '#5b4c41',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  dealTerms: {
    color: '#7a6658',
    fontSize: 13,
    marginTop: 8,
  },
  hourList: {
    gap: 10,
    marginTop: 10,
  },
  hourGroupCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd9c5',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hourGroupDays: {
    color: '#7f461f',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  hourRow: {
    color: '#43352c',
    fontSize: 13,
  },
  emptyStateText: {
    color: '#735e4c',
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 20,
  },
  errorBanner: {
    backgroundColor: '#ffe0d6',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: '#8d2500',
    fontSize: 13,
    lineHeight: 18,
  },
  mapErrorBanner: {
    alignSelf: 'stretch',
  },
  splashScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#f6ead8',
  },
  splashLogoShell: {
    alignItems: 'center',
    backgroundColor: '#1f5f5b',
    borderRadius: 36,
    height: 112,
    justifyContent: 'center',
    shadowColor: '#1b443f',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    width: 112,
  },
  splashLogoText: {
    color: '#effffd',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: 2,
  },
  splashTitle: {
    color: '#2d221a',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 22,
  },
  splashSubtitle: {
    color: '#6c5443',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    maxWidth: 320,
    textAlign: 'center',
  },
  authScreen: {
    flex: 1,
    paddingHorizontal: 18,
  },
  keyboardAvoidingFill: {
    flex: 1,
  },
  authScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 32,
  },
  authHero: {
    alignItems: 'center',
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  authLogoShell: {
    alignItems: 'center',
    backgroundColor: '#1f5f5b',
    borderRadius: 28,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  authLogoText: {
    color: '#effffd',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  authTitle: {
    color: '#2d221a',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 18,
    textAlign: 'center',
  },
  authSubtitle: {
    color: '#6c5443',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 320,
    textAlign: 'center',
  },
  authLinkButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  authLinkText: {
    color: '#1f5f5b',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  profileScreen: {
    flex: 1,
    paddingHorizontal: 18,
  },
  profileScreenLandscape: {
    alignSelf: 'center',
    maxWidth: 980,
    width: '100%',
  },
  profileScrollContent: {
    flexGrow: 1,
    paddingTop: 24,
    paddingBottom: 32,
  },
  dashboardScrollContent: {
    flexGrow: 1,
    paddingTop: 8,
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    marginTop: 12,
    padding: 18,
  },
  dashboardCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    marginTop: 8,
    padding: 18,
  },
  profileIntroText: {
    color: '#6c5443',
    fontSize: 14,
    lineHeight: 20,
  },
  profileSuccessBanner: {
    backgroundColor: '#e7f6f4',
    borderColor: '#9dcfc9',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  profileSuccessText: {
    color: '#17413e',
    fontSize: 13,
    fontWeight: '700',
  },
  profileFormSection: {
    gap: 10,
  },
  profileFieldLabel: {
    color: '#402214',
    fontSize: 13,
    fontWeight: '700',
  },
  profileInput: {
    backgroundColor: '#f8efe3',
    borderColor: '#ead6bf',
    borderRadius: 14,
    borderWidth: 1,
    color: '#2d221a',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  compactDropdownWrap: {
    gap: 6,
  },
  compactDropdownButton: {
    backgroundColor: '#f8efe3',
    borderColor: '#ead6bf',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  compactDropdownButtonOpen: {
    borderColor: '#1f5f5b',
  },
  compactDropdownText: {
    color: '#2d221a',
    fontSize: 14,
    lineHeight: 18,
  },
  compactDropdownPlaceholder: {
    color: '#8a705d',
  },
  compactDropdownCaret: {
    color: '#6c5443',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
  compactDropdownMenu: {
    backgroundColor: '#fffaf4',
    borderColor: '#ead6bf',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  compactDropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactDropdownOptionSelected: {
    backgroundColor: '#e7f6f4',
  },
  compactDropdownOptionText: {
    color: '#2d221a',
    fontSize: 14,
    lineHeight: 18,
  },
  compactDropdownOptionTextSelected: {
    color: '#17413e',
    fontWeight: '700',
  },
  profileSupportText: {
    color: '#7d614f',
    fontSize: 12,
    lineHeight: 18,
    marginTop: -2,
  },
  claimResultsList: {
    gap: 12,
    marginTop: 8,
  },
  claimResultCard: {
    backgroundColor: '#fff3e5',
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  linkButtonSecondaryWide: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#fff7ef',
    borderColor: '#1f5f5b',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dashboardCalloutCard: {
    backgroundColor: '#fff3e5',
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  dashboardVerifiedCard: {
    backgroundColor: '#e7f6f4',
    borderColor: '#9dcfc9',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  dashboardVerifiedTitle: {
    color: '#17413e',
    fontSize: 16,
    fontWeight: '800',
  },
  dashboardVerifiedText: {
    color: '#17413e',
    fontSize: 13,
    lineHeight: 18,
  },
  dashboardSectionCard: {
    backgroundColor: '#fff7ef',
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  dashboardSectionTitle: {
    color: '#402214',
    fontSize: 16,
    fontWeight: '800',
  },
  dashboardSupportText: {
    color: '#6c5443',
    fontSize: 13,
    lineHeight: 18,
  },
  dashboardDetailRow: {
    gap: 4,
  },
  dashboardDetailLabel: {
    color: '#7a4d2f',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dashboardDetailValue: {
    color: '#2d221a',
    fontSize: 15,
    lineHeight: 20,
  },
  dashboardFooterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  toggleChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ef',
    borderColor: '#caa98d',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleChipActive: {
    backgroundColor: '#1f5f5b',
    borderColor: '#1f5f5b',
  },
  toggleChipText: {
    color: '#7a4d2f',
    fontSize: 13,
    fontWeight: '700',
  },
  toggleChipTextActive: {
    color: '#effffd',
  },
  profileTextarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
