import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AppState, NativeModules } from 'react-native';

import { getVenueMarkerStyle } from '../browseConfig';
import type { PlaceListItem, SignupResponse } from '../types';

type MockNetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
};

const mockFetchPlaces = jest.fn<Promise<PlaceListItem[]>, [string, string]>();
const mockFetchLiveLocationPlaces = jest.fn<Promise<Array<{ slug: string; latitude: number | null; longitude: number | null; updated_at: string | null }>>, [string, string]>();
const mockFetchPlaceDetail = jest.fn();
const mockFetchProfileDashboard = jest.fn();
const mockDeleteProfileAccount = jest.fn();
const mockClearPlacesCache = jest.fn();
const mockClearPersistedPlaceCache = jest.fn(async () => undefined);
const mockLoginProfile = jest.fn();
const mockUpdateBusinessLocation = jest.fn();
const mockRegisterPushDevice = jest.fn();
let mockNotificationResponseListener: ((response: unknown) => void) | null = null;
let mockMarkerRenderCount = 0;
const mockRegisterForPushNotificationsAsync = jest.fn<Promise<{
  installationId: string;
  platform: 'ios' | 'android';
  pushToken: string;
} | null>, []>(async () => null);
let mockNetworkState: MockNetworkState = {
  isConnected: true,
  isInternetReachable: true,
  type: 'WIFI',
};
const mockGetNetworkStateAsync = jest.fn(async () => mockNetworkState);
const mockNetworkListeners = new Set<(state: MockNetworkState) => void>();
let mockAppStateChangeListener: ((state: string) => void) | null = null;

jest.mock('../api', () => ({
  beginTwoFactorSetup: jest.fn(),
  clearPlacesCache: () => mockClearPlacesCache(),
  confirmTwoFactorSetup: jest.fn(),
  createBusinessProfile: jest.fn(),
  createCustomerProfile: jest.fn(),
  createInformalBusinessProfile: jest.fn(),
  createManualBusinessProfile: jest.fn(),
  deleteProfileAccount: (baseUrl: string, authToken: string, password: string) => mockDeleteProfileAccount(baseUrl, authToken, password),
  disableTwoFactor: jest.fn(),
  fetchFeed: jest.fn(),
  fetchLiveLocationPlaces: (...args: [string, string]) => mockFetchLiveLocationPlaces(...args),
  fetchPlaceDetail: (...args: unknown[]) => mockFetchPlaceDetail(...args),
  fetchPlaces: (...args: [string, string]) => mockFetchPlaces(...args),
  fetchProfileDashboard: (...args: unknown[]) => mockFetchProfileDashboard(...args),
  getDefaultApiBaseUrl: jest.fn(() => 'http://127.0.0.1:8000/api'),
  loginProfile: (...args: unknown[]) => mockLoginProfile(...args),
  registerPushDevice: (...args: unknown[]) => mockRegisterPushDevice(...args),
  recordFeedEngagement: jest.fn(),
  recordFeedImpression: jest.fn(),
  requestPasswordReset: jest.fn(),
  requestUsernameReminder: jest.fn(),
  resendVerificationCode: jest.fn(),
  resendVerificationEmail: jest.fn(),
  submitSupportRequest: jest.fn(),
  toggleFavoriteBusiness: jest.fn(),
  updateBusinessLocation: (...args: unknown[]) => mockUpdateBusinessLocation(...args),
  updateBusinessLocationTrackingPreference: jest.fn(),
  updateProfileDashboard: jest.fn(),
  updateProfileDashboardWithUploads: jest.fn(),
  verifyEmailCode: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 1 },
  getCurrentPositionAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
  isBackgroundLocationAvailableAsync: jest.fn(async () => false),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  addNotificationResponseReceivedListener: jest.fn((listener: (response: unknown) => void) => {
    mockNotificationResponseListener = listener;
    return { remove: jest.fn() };
  }),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test-token]' })),
  requestPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
}));

jest.mock('expo-network', () => ({
  NetworkStateType: {
    NONE: 'NONE',
    UNKNOWN: 'UNKNOWN',
    WIFI: 'WIFI',
  },
  addNetworkStateListener: jest.fn((listener: (state: MockNetworkState) => void) => {
    mockNetworkListeners.add(listener);
    return {
      remove: () => {
        mockNetworkListeners.delete(listener);
      },
    };
  }),
  getNetworkStateAsync: () => mockGetNetworkStateAsync(),
  __setMockNetworkState: (nextState: MockNetworkState) => {
    mockNetworkState = nextState;
  },
}));

jest.mock('../pushNotifications', () => ({
  extractDirectMessageThreadIdFromNotificationData: (data: unknown) => {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const rawThreadId = (data as Record<string, unknown>).thread_id;
    const parsedThreadId = typeof rawThreadId === 'number'
      ? rawThreadId
      : Number.parseInt(String(rawThreadId ?? ''), 10);
    return Number.isNaN(parsedThreadId) || parsedThreadId <= 0 ? null : parsedThreadId;
  },
  extractFavoriteBusinessSlugFromNotificationData: (data: unknown) => {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const slug = (data as Record<string, unknown>).slug;
    return typeof slug === 'string' && slug.trim().length ? slug.trim() : null;
  },
  registerForPushNotificationsAsync: () => mockRegisterForPushNotificationsAsync(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const React = require('react');
    const { View } = require('react-native');

    return <View testID={`mock-ionicon-${name}`} />;
  },
  MaterialCommunityIcons: ({ name }: { name: string }) => {
    const React = require('react');
    const { View } = require('react-native');

    return <View testID={`mock-material-community-icon-${name}`} />;
  },
}));

jest.mock('../screens/SplashScreen', () => ({
  SplashScreen: ({ onIntroComplete }: { onIntroComplete: () => void }) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');

    return (
      <Pressable onPress={onIntroComplete} testID="complete-splash-intro">
        <Text>Complete intro</Text>
      </Pressable>
    );
  },
}));

jest.mock('../screens/DashboardScreen', () => ({
  AccountSettingsScreen: ({ onChangeDeleteAccountPassword, onDeleteAccount, onLogout }: { onChangeDeleteAccountPassword: (value: string) => void; onDeleteAccount: () => void; onLogout: () => void }) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return (
      <View>
        <Text>Settings screen</Text>
        <Pressable accessibilityLabel="Set delete password" onPress={() => onChangeDeleteAccountPassword('password123')}>
          <Text>Set delete password</Text>
        </Pressable>
        <Pressable accessibilityLabel="Delete account" onPress={onDeleteAccount}>
          <Text>Delete account</Text>
        </Pressable>
        <Pressable accessibilityLabel="Log out" onPress={onLogout}>
          <Text>Log out</Text>
        </Pressable>
      </View>
    );
  },
  BusinessProfileEditorScreen: () => null,
  FavoriteBusinessesScreen: () => {
    const React = require('react');
    const { Text } = require('react-native');

    return <Text>Favorite businesses screen</Text>;
  },
  DashboardScreen: ({ onOpenFavoriteBusinesses, onOpenPlaces, onOpenSettings }: { onOpenFavoriteBusinesses: () => void; onOpenPlaces: () => void; onOpenSettings: () => void }) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return (
      <View>
        <Text>Dashboard screen</Text>
        <Pressable accessibilityLabel="Open favorite businesses" onPress={onOpenFavoriteBusinesses}>
          <Text>Open favorite businesses</Text>
        </Pressable>
        <Pressable accessibilityLabel="Open places" onPress={onOpenPlaces}>
          <Text>Open places</Text>
        </Pressable>
        <Pressable accessibilityLabel="Open settings" onPress={onOpenSettings}>
          <Text>Open settings</Text>
        </Pressable>
      </View>
    );
  },
}));

jest.mock('../screens/PlaceDetailScreen', () => ({
  PlaceDetailScreen: ({ selectedPlace }: { selectedPlace?: { slug?: string } | null }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return selectedPlace ? <Text testID="mock-place-detail">{selectedPlace.slug}</Text> : null;
  },
}));

jest.mock('../businessLocationTracking', () => ({
  clearPersistedBusinessTrackingSession: jest.fn(async () => undefined),
  commitBusinessLocationReport: jest.fn(async () => undefined),
  ensureBusinessBackgroundLocationTaskStarted: jest.fn(async () => undefined),
  loadPersistedBusinessTrackingSession: jest.fn(async () => null),
  reserveBusinessLocationReport: jest.fn(async () => true),
  stopBusinessBackgroundLocationTask: jest.fn(async () => undefined),
}));

jest.mock('../placeCache', () => ({
  clearPersistedPlaceCache: () => mockClearPersistedPlaceCache(),
  loadPersistedPlaceCache: jest.fn(async () => null),
  persistPlaceCache: jest.fn(async () => undefined),
}));

jest.mock('../screens/ProfileFlowScreens', () => ({
  AuthPortalScreen: ({ autoFocusIdentifier, onBackToLanding, onChangeField, onSubmit }: { autoFocusIdentifier?: boolean; onBackToLanding: () => void; onChangeField: (field: string, value: string) => void; onSubmit: () => void }) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    React.useEffect(() => {
      onChangeField('identifier', 'guestfan');
      onChangeField('password', 'password123');
    }, []);

    return (
      <View>
        <Text>Auth screen</Text>
        {autoFocusIdentifier ? <Text>Login auto focus enabled</Text> : null}
        <Pressable
          accessibilityLabel="Submit login"
          onPress={onSubmit}
        >
          <Text>Submit login</Text>
        </Pressable>
        <Pressable accessibilityLabel="Back to landing" onPress={onBackToLanding}>
          <Text>Back to landing</Text>
        </Pressable>
      </View>
    );
  },
  BusinessClaimReviewPendingScreen: () => null,
  BusinessSearchScreen: () => null,
  BusinessVerificationScreen: () => null,
  ContactSupportScreen: () => null,
  CreateProfileScreen: ({ onBack }: { onBack: () => void }) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return (
      <View>
        <Text>Create profile screen</Text>
        <Pressable accessibilityLabel="Back from profiles" onPress={onBack}>
          <Text>Back from profiles</Text>
        </Pressable>
      </View>
    );
  },
  EmailVerificationScreen: () => null,
  PrivacyPolicyScreen: () => null,
  TermsOfServiceScreen: () => null,
}));

jest.mock('../components/PhotoLightbox', () => ({
  PhotoLightbox: () => null,
}));

jest.mock('../screens/DirectMessagesScreen', () => ({
  DirectMessagesScreen: () => {
    const React = require('react');
    const { Text } = require('react-native');

    return <Text>Direct messages screen</Text>;
  },
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const animateToRegionMock = jest.fn();
  const initialRegionMock = jest.fn();
  const setMapBoundariesMock = jest.fn();

  const MapView = React.forwardRef(({
    children,
    initialRegion,
    testID,
  }: {
    children?: React.ReactNode;
    initialRegion?: unknown;
    testID?: string;
  }, ref: React.ForwardedRef<{ animateToRegion: jest.Mock; setMapBoundaries: jest.Mock }>) => {
    initialRegionMock(initialRegion);
    React.useImperativeHandle(ref, () => ({
      animateToRegion: animateToRegionMock,
      setMapBoundaries: setMapBoundariesMock,
    }));

    return <View testID={testID ?? 'mock-map-view'}>{children}</View>;
  });

  const Marker = ({ children, coordinate, onPress, style, tracksViewChanges }: {
    children?: React.ReactNode;
    coordinate?: { latitude: number; longitude: number };
    onPress?: () => void;
    style?: unknown;
    tracksViewChanges?: boolean;
  }) => {
    const { Pressable } = require('react-native');
    mockMarkerRenderCount += 1;

    return <Pressable coordinate={coordinate} onPress={onPress} style={style} testID="mock-map-marker" tracksViewChanges={tracksViewChanges}>{children}</Pressable>;
  };

  return {
    __esModule: true,
    default: MapView,
    Marker,
    __mock: {
      animateToRegionMock,
      getMarkerRenderCount: () => mockMarkerRenderCount,
      initialRegionMock,
      resetMarkerRenderCount: () => {
        mockMarkerRenderCount = 0;
      },
      setMapBoundariesMock,
    },
  };
});

import App from '../../App';

const mapsModule = jest.requireMock('react-native-maps') as {
  __mock: {
    animateToRegionMock: jest.Mock;
    getMarkerRenderCount: () => number;
    initialRegionMock: jest.Mock;
    resetMarkerRenderCount: () => void;
    setMapBoundariesMock: jest.Mock;
  };
};
const networkModule = jest.requireMock('expo-network') as {
  __setMockNetworkState: (nextState: { isConnected?: boolean; isInternetReachable?: boolean; type?: string }) => void;
};
const locationModule = jest.requireMock('expo-location') as {
  getBackgroundPermissionsAsync: jest.Mock;
  getCurrentPositionAsync: jest.Mock;
  getForegroundPermissionsAsync: jest.Mock;
  isBackgroundLocationAvailableAsync: jest.Mock;
  requestForegroundPermissionsAsync: jest.Mock;
  watchPositionAsync: jest.Mock;
};

const originalAppStateAddEventListener = AppState.addEventListener.bind(AppState);

const samplePlace: PlaceListItem = {
  id: 1,
  name: 'Baskin-Robbins',
  slug: 'baskin-robbins',
  city: 'camarillo',
  city_label: 'Camarillo',
  venue_type: 'cafe',
  venue_type_label: 'Cafe',
  address_line_1: '738 Arneill Rd',
  address_line_2: '',
  neighborhood: '',
  state: 'CA',
  postal_code: '93010',
  latitude: 34.2171,
  longitude: -119.0385,
  phone_number: '805-555-0101',
  website_url: 'https://example.com/baskin-robbins',
  image_urls: [],
  operating_hours: [],
  is_active: true,
  has_deals: true,
  deal_count: 1,
  operating_weekdays: [],
  deal_weekdays: [],
  is_verified: false,
  is_claimed: false,
  locations: [],
};

const secondSamplePlace: PlaceListItem = {
  ...samplePlace,
  id: 2,
  name: 'Yard House',
  slug: 'yard-house',
  city: 'oxnard',
  city_label: 'Oxnard',
  address_line_1: '501 Collection Blvd Ste # 4130',
  latitude: 34.1975,
  longitude: -119.1771,
  phone_number: '805-555-0102',
};

const thirdSamplePlace: PlaceListItem = {
  ...samplePlace,
  id: 3,
  name: 'Cafe Rio',
  slug: 'cafe-rio',
  city: 'ventura',
  city_label: 'Ventura',
  latitude: 34.2746,
  longitude: -119.2291,
  phone_number: '805-555-0103',
};

const noPinSamplePlace: PlaceListItem = {
  ...samplePlace,
  id: 4,
  name: 'No Pin Cafe',
  slug: 'no-pin-cafe',
  address_line_1: '100 Harbor Way',
  latitude: null,
  longitude: null,
  phone_number: '805-555-0104',
};

describe('App browse map search', () => {
  beforeEach(() => {
    mockAppStateChangeListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, listener: (state: string) => void) => {
      if (type === 'change') {
        mockAppStateChangeListener = listener;
      }

      return {
        remove: jest.fn(),
      } as any;
    }) as typeof AppState.addEventListener);
    mockNetworkListeners.clear();
    mockNotificationResponseListener = null;
    networkModule.__setMockNetworkState({
      isConnected: true,
      isInternetReachable: true,
      type: 'WIFI',
    });
    mockGetNetworkStateAsync.mockClear();
    mockFetchPlaces.mockResolvedValue([samplePlace]);
    mockFetchLiveLocationPlaces.mockReset();
    mockFetchLiveLocationPlaces.mockResolvedValue([]);
    mockFetchPlaceDetail.mockReset();
    mockFetchProfileDashboard.mockResolvedValue(null);
    mockDeleteProfileAccount.mockReset();
    mockDeleteProfileAccount.mockResolvedValue({ detail: 'Account permanently deleted.' });
    mockClearPlacesCache.mockClear();
    mockClearPersistedPlaceCache.mockClear();
    mockUpdateBusinessLocation.mockReset();
    mockRegisterPushDevice.mockReset();
    mockRegisterForPushNotificationsAsync.mockReset();
    mockRegisterForPushNotificationsAsync.mockResolvedValue(null);
    mockLoginProfile.mockResolvedValue({
      id: 7,
      username: 'guestfan',
      email: 'guestfan@example.com',
      first_name: 'Guest',
      last_name: 'Fan',
      auth_token: 'token-123',
      portal: 'customer',
      profile_type: 'customer',
      email_verified: true,
      two_factor_enabled: false,
      can_access_places: true,
    });
    locationModule.getBackgroundPermissionsAsync.mockReset();
    locationModule.getBackgroundPermissionsAsync.mockResolvedValue({ canAskAgain: false, granted: false });
    locationModule.getCurrentPositionAsync.mockReset();
    locationModule.getForegroundPermissionsAsync.mockReset();
    locationModule.getForegroundPermissionsAsync.mockResolvedValue({ canAskAgain: false, granted: false });
    locationModule.isBackgroundLocationAvailableAsync.mockReset();
    locationModule.isBackgroundLocationAvailableAsync.mockResolvedValue(false);
    locationModule.requestForegroundPermissionsAsync.mockReset();
    locationModule.requestForegroundPermissionsAsync.mockResolvedValue({ canAskAgain: false, granted: false });
    locationModule.watchPositionAsync.mockReset();
    locationModule.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });
    mapsModule.__mock.animateToRegionMock.mockClear();
    mapsModule.__mock.resetMarkerRenderCount();
    mapsModule.__mock.initialRegionMock.mockClear();
    mapsModule.__mock.setMapBoundariesMock.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockNetworkListeners.clear();
    mockFetchPlaces.mockReset();
    mockFetchLiveLocationPlaces.mockReset();
    mockFetchProfileDashboard.mockReset();
    mockDeleteProfileAccount.mockReset();
    mockClearPlacesCache.mockReset();
    mockClearPersistedPlaceCache.mockReset();
    mockLoginProfile.mockReset();
    mockUpdateBusinessLocation.mockReset();
    mockRegisterPushDevice.mockReset();
    mockRegisterForPushNotificationsAsync.mockReset();
  });

  it('registers push notifications for business sessions so direct-message pushes can be delivered', async () => {
    mockRegisterForPushNotificationsAsync.mockResolvedValue({
      installationId: 'installation-1',
      pushToken: 'ExponentPushToken[business-token]',
      platform: 'ios',
    });
    mockLoginProfile.mockResolvedValue({
      id: 9,
      username: 'bizowner',
      email: 'bizowner@example.com',
      first_name: 'Biz',
      last_name: 'Owner',
      auth_token: 'business-token-123',
      portal: 'business',
      profile_type: 'business',
      email_verified: true,
      two_factor_enabled: false,
      can_access_places: true,
      approved_businesses: [],
      requires_business_location_tracking: false,
    });

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Open business login'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Submit login'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockRegisterForPushNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushDevice).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api',
      'business-token-123',
      {
        installation_id: 'installation-1',
        push_token: 'ExponentPushToken[business-token]',
        platform: 'ios',
        portal: 'business',
      },
    );
  });

  it('resumes a logged-out direct-message notification after business login', async () => {
    mockLoginProfile.mockResolvedValue({
      id: 9,
      username: 'bizowner',
      email: 'bizowner@example.com',
      first_name: 'Biz',
      last_name: 'Owner',
      auth_token: 'business-token-123',
      portal: 'business',
      profile_type: 'business',
      email_verified: true,
      two_factor_enabled: false,
      can_access_places: true,
      approved_businesses: [],
      requires_business_location_tracking: false,
    });

    render(<App />);

    await act(async () => {
      mockNotificationResponseListener?.({
        notification: {
          request: {
            identifier: 'dm-logged-out',
            content: {
              data: {
                portal: 'business',
                slug: 'baskin-robbins',
                thread_id: 44,
                type: 'direct_message',
              },
            },
          },
        },
      });
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getByText('Auth screen')).toBeTruthy();

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Submit login'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockLoginProfile).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api',
      expect.objectContaining({
        identifier: 'guestfan',
        password: 'password123',
        portal: 'business',
      }),
    );
    expect(screen.getByText('Direct messages screen')).toBeTruthy();
  });

  it('shows the no-internet gate on startup and blocks the app from loading places', async () => {
    networkModule.__setMockNetworkState({
      isConnected: false,
      isInternetReachable: false,
      type: 'NONE',
    });

    render(<App />);

    expect(await screen.findByText('No internet connection')).toBeTruthy();
    expect(screen.getByText('This device is not able to connect to Wi-Fi or mobile data. Reconnect to the internet to use the app.')).toBeTruthy();
    expect(screen.queryByTestId('complete-splash-intro')).toBeNull();
    expect(mockFetchPlaces).not.toHaveBeenCalled();
  });

  it('keeps the cached map and last-known pins visible after connectivity drops', async () => {
    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);

    const offlineState = {
      isConnected: false,
      isInternetReachable: false,
      type: 'NONE',
    } as const;
    networkModule.__setMockNetworkState(offlineState);
    act(() => {
      mockNetworkListeners.forEach((listener) => listener(offlineState));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Offline. Showing last known locations.')).toBeTruthy();
    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);
    expect(screen.queryByText('No internet connection')).toBeNull();
  });

  it('applies a fetched live coordinate to the rendered map marker', async () => {
    const livePlace = {
      ...samplePlace,
      locations: [{
        ...samplePlace,
        id: 11,
        slug: 'baskin-robbins-camarillo',
      }],
    } as PlaceListItem;
    mockFetchPlaces.mockResolvedValue([livePlace]);
    mockFetchLiveLocationPlaces.mockResolvedValue([{
      slug: 'baskin-robbins-camarillo',
      latitude: 34.2789,
      longitude: -119.2914,
      updated_at: '2026-08-03T17:33:20Z',
    }]);

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mockFetchLiveLocationPlaces).toHaveBeenCalled();
    expect(screen.getByTestId('mock-map-marker').props.coordinate).toEqual({
      latitude: 34.2789,
      longitude: -119.2914,
    });
  });

  it('retries a stationary vendor location after the device reconnects', async () => {
    const businessSession = {
      id: 9,
      username: 'bizowner',
      email: 'bizowner@example.com',
      first_name: 'Biz',
      last_name: 'Owner',
      auth_token: 'business-token-123',
      portal: 'business' as const,
      profile_type: 'business' as const,
      email_verified: true,
      two_factor_enabled: false,
      can_access_places: true,
      approved_businesses: [{ slug: samplePlace.slug }],
      requires_business_location_tracking: true,
    };
    const currentPosition = {
      coords: {
        accuracy: 4,
        latitude: 34.2171,
        longitude: -119.0385,
      },
      timestamp: Date.now(),
    };
    mockLoginProfile.mockResolvedValue(businessSession);
    mockUpdateBusinessLocation.mockResolvedValue(businessSession);
    locationModule.requestForegroundPermissionsAsync.mockResolvedValue({ canAskAgain: false, granted: true });
    locationModule.getCurrentPositionAsync.mockResolvedValue(currentPosition);

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Open business login'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Submit login'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(mockUpdateBusinessLocation).toHaveBeenCalledTimes(1);

    const offlineState = {
      isConnected: false,
      isInternetReachable: false,
      type: 'NONE',
    } as const;
    networkModule.__setMockNetworkState(offlineState);
    act(() => {
      mockNetworkListeners.forEach((listener) => listener(offlineState));
    });

    await act(async () => {
      await Promise.resolve();
    });

    const onlineState = {
      isConnected: true,
      isInternetReachable: true,
      type: 'WIFI',
    } as const;
    networkModule.__setMockNetworkState(onlineState);
    act(() => {
      mockNetworkListeners.forEach((listener) => listener(onlineState));
    });

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(mockUpdateBusinessLocation).toHaveBeenCalledTimes(2);
    expect(mockUpdateBusinessLocation).toHaveBeenLastCalledWith(
      'http://127.0.0.1:8000/api',
      'business-token-123',
      expect.objectContaining({
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
      }),
    );
  });

  it('does not trigger additional map auto-fit animations for gibberish no-match searches', async () => {
    render(<App />);

    await screen.findByTestId('complete-splash-intro');

    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mockFetchPlaces).toHaveBeenCalled();
    expect(screen.getByTestId('browse-search-input')).toBeTruthy();
    expect(screen.getByLabelText('Open Home Feed')).toBeTruthy();
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText('Sign Up')).toBeTruthy();
    expect(screen.getByText('Business')).toBeTruthy();
    expect(screen.getByLabelText('Switch to light map')).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mapsModule.__mock.initialRegionMock).toHaveBeenCalled();
    expect(mapsModule.__mock.animateToRegionMock).not.toHaveBeenCalled();
    const baselineAnimateCount = mapsModule.__mock.animateToRegionMock.mock.calls.length;

    fireEvent.changeText(screen.getByTestId('browse-search-input'), 'zr');

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.changeText(screen.getByTestId('browse-search-input'), 'bh');

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mapsModule.__mock.animateToRegionMock).toHaveBeenCalledTimes(baselineAnimateCount);
    expect(screen.getByText('No map matches found for that search yet.')).toBeTruthy();
  });

  it('opens the full place profile when a map marker is pressed', async () => {
    mockFetchPlaceDetail.mockResolvedValue({
      ...samplePlace,
      deals: [],
      locations: [],
    });

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.changeText(screen.getByTestId('browse-search-input'), 'ba');

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 180));
    });

    expect(screen.getByText('Best matches')).toBeTruthy();
    expect(screen.getByLabelText('Select Baskin-Robbins')).toBeTruthy();
    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);
    const marker = screen.getByTestId('mock-map-marker');
    expect(within(marker).getAllByTestId('mock-material-community-icon-map-marker')).not.toHaveLength(0);
    expect(within(marker).getByTestId('mock-material-community-icon-map-marker-outline')).toBeTruthy();
    expect(within(marker).getByTestId('mock-material-community-icon-coffee')).toBeTruthy();
    const markerChildren = React.Children.toArray(screen.getByTestId('mock-map-marker').props.children);
    expect(markerChildren[0]).toEqual(expect.objectContaining({
      props: expect.objectContaining({
        style: expect.arrayContaining([expect.objectContaining({ opacity: 1 })]),
      }),
    }));
    const lastMapRegion = mapsModule.__mock.animateToRegionMock.mock.calls.at(-1)?.[0] as { latitude?: number } | undefined;
    expect(lastMapRegion?.latitude).toBeGreaterThan(samplePlace.latitude ?? 0);
    expect(lastMapRegion?.latitude).toBeLessThan((samplePlace.latitude ?? 0) + 0.04 * 0.18);
    fireEvent.press(screen.getByTestId('mock-map-marker'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mockFetchPlaceDetail).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api',
      samplePlace.slug,
      undefined,
    );
    expect(screen.getByTestId('mock-place-detail')).toHaveTextContent(samplePlace.slug);
    expect(screen.queryByText('Best matches')).toBeNull();
  });

  it('prompts guests to create a customer account before filtering favorite businesses', async () => {
    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByTestId('browse-filters-toggle'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(screen.getByTestId('browse-favorite-businesses-filter')).toBeTruthy();
    fireEvent.press(screen.getByTestId('browse-favorite-businesses-filter'));

    expect(screen.getByText('Create a free customer account to filter favorites')).toBeTruthy();
    fireEvent.press(screen.getByText('Create free customer account'));

    expect(await screen.findByText('Create profile screen')).toBeTruthy();
  });

  it('keeps Focus for multiple results, promotes the focused row to Select, and skips the preview', async () => {
    mockFetchPlaces.mockResolvedValue([samplePlace, secondSamplePlace]);
    mockFetchPlaceDetail.mockResolvedValue({
      ...secondSamplePlace,
      deals: [],
      locations: [],
    });

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.changeText(screen.getByTestId('browse-search-input'), 'a');

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByLabelText('Focus Baskin-Robbins')).toBeTruthy();
    expect(screen.getByLabelText('Focus Yard House')).toBeTruthy();

    const yardHouseMarkerBeforeFocus = screen.getAllByTestId('mock-map-marker').find((marker) => (
      marker.props.coordinate?.latitude === secondSamplePlace.latitude
    ));
    expect(yardHouseMarkerBeforeFocus).toBeDefined();
    const baselineAnimateCount = mapsModule.__mock.animateToRegionMock.mock.calls.length;
    fireEvent.press(screen.getByLabelText('Focus Yard House'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mapsModule.__mock.animateToRegionMock.mock.calls.length).toBeGreaterThan(baselineAnimateCount);
    expect(screen.getByText('Best matches')).toBeTruthy();
    expect(screen.getByText('Top 1 of 1 in view')).toBeTruthy();
    expect(screen.getByLabelText('Select Yard House')).toBeTruthy();
    expect(screen.queryByLabelText('Focus Baskin-Robbins')).toBeNull();
    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);
    const focusedMarker = screen.getByTestId('mock-map-marker');
    expect(focusedMarker).toBe(yardHouseMarkerBeforeFocus);
    const focusedMarkerChildren = React.Children.toArray(focusedMarker.props.children);
    const focusedMarkerView = focusedMarkerChildren[0];
    expect(React.isValidElement<{ style?: unknown; children?: React.ReactNode }>(focusedMarkerView)).toBe(true);
    if (!React.isValidElement<{ style?: unknown; children?: React.ReactNode }>(focusedMarkerView)) {
      throw new Error('The focused map marker did not render its animated wrapper.');
    }
    const focusedMarkerViewChildren = React.Children.toArray(focusedMarkerView.props.children);
    expect(focusedMarkerViewChildren).toHaveLength(1);
    const focusedMapRegion = mapsModule.__mock.animateToRegionMock.mock.calls.at(-1)?.[0] as { latitude?: number } | undefined;
    expect(focusedMapRegion?.latitude).toBeGreaterThan(secondSamplePlace.latitude ?? 0);
    expect(screen.queryByText('Photos from this business page have not been found yet.')).toBeNull();

    fireEvent.press(screen.getByLabelText('Select Yard House'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mockFetchPlaceDetail).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api',
      secondSamplePlace.slug,
      undefined,
    );
    expect(screen.getByTestId('mock-place-detail')).toHaveTextContent(secondSamplePlace.slug);
    expect(screen.queryByText('Best matches')).toBeNull();
  });

  it('uses Focus then Select for a business without a map pin and opens its profile', async () => {
    mockFetchPlaces.mockResolvedValue([samplePlace, noPinSamplePlace]);
    mockFetchPlaceDetail.mockResolvedValue({
      ...noPinSamplePlace,
      deals: [],
      locations: [],
    });

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.changeText(screen.getByTestId('browse-search-input'), 'a');

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByLabelText('Focus No Pin Cafe')).toBeTruthy();
    expect(screen.queryByLabelText('Preview No Pin Cafe')).toBeNull();

    fireEvent.press(screen.getByLabelText('Focus No Pin Cafe'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getByText('Best matches')).toBeTruthy();
    expect(screen.getByText('Top 1 of 1 in view')).toBeTruthy();
    expect(screen.getByLabelText('Select No Pin Cafe')).toBeTruthy();
    expect(screen.queryByLabelText('Focus Baskin-Robbins')).toBeNull();
    expect(screen.queryByText('Photos from this business page have not been found yet.')).toBeNull();

    fireEvent.press(screen.getByLabelText('Select No Pin Cafe'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mockFetchPlaceDetail).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api',
      noPinSamplePlace.slug,
      undefined,
    );
    expect(screen.getByTestId('mock-place-detail')).toHaveTextContent(noPinSamplePlace.slug);
    expect(screen.queryByText('Best matches')).toBeNull();
  });

  it('keeps the previous map marker mounted while a typed search settles', async () => {
    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const searchInput = screen.getByTestId('browse-search-input');
    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);

    fireEvent.changeText(searchInput, 'z');

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.changeText(searchInput, 'ba');

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);
  });

  it('stops tracking every marker while search text is rapidly typed and cleared', async () => {
    mockFetchPlaces.mockResolvedValue([samplePlace, secondSamplePlace, thirdSamplePlace]);

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(3);
    const searchInput = screen.getByTestId('browse-search-input');

    fireEvent.changeText(searchInput, 'z');
    fireEvent.changeText(searchInput, '');

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const markerViews = screen.getAllByTestId('mock-map-marker');
    expect(markerViews).toHaveLength(3);
    expect(markerViews.every((marker) => marker.props.tracksViewChanges === false)).toBe(true);
  });

  it('does not rebuild the full marker set for each raw search keystroke', async () => {
    mockFetchPlaces.mockResolvedValue([samplePlace, secondSamplePlace, thirdSamplePlace]);

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const searchInput = screen.getByTestId('browse-search-input');
    fireEvent.changeText(searchInput, 'z');
    const renderCountAfterFirstKeystroke = mapsModule.__mock.getMarkerRenderCount();

    fireEvent.changeText(searchInput, 'zr');
    fireEvent.changeText(searchInput, 'zrx');

    expect(mapsModule.__mock.getMarkerRenderCount()).toBe(renderCountAfterFirstKeystroke);
  });

  it('keeps the full marker set mounted until a search query settles', async () => {
    mockFetchPlaces.mockResolvedValue([samplePlace, secondSamplePlace, thirdSamplePlace]);

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const searchInput = screen.getByTestId('browse-search-input');
    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(3);

    fireEvent.changeText(searchInput, 'ba');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(3);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);
  });

  it('keeps the current map marker mounted while places refresh is pending', async () => {
    let resolveRefreshPlaces: ((places: PlaceListItem[]) => void) | null = null;
    const refreshPlacesPromise = new Promise<PlaceListItem[]>((resolve) => {
      resolveRefreshPlaces = resolve;
    });

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const markerBeforeRefresh = screen.getByTestId('mock-map-marker');
    mockFetchPlaces.mockImplementationOnce(() => refreshPlacesPromise);

    fireEvent.press(screen.getByLabelText('Refresh places'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('mock-map-marker')).toBe(markerBeforeRefresh);

    await act(async () => {
      resolveRefreshPlaces?.([secondSamplePlace]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);
  });

  it('returns the guest sign-in flow to the browse map', async () => {
    render(<App />);

    await screen.findByTestId('complete-splash-intro');

    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Open customer login'));
    expect(screen.getByText('Auth screen')).toBeTruthy();
    expect(screen.getByTestId('mock-map-view')).toBeTruthy();
    expect(screen.queryByText('Login auto focus enabled')).toBeNull();

    fireEvent.press(screen.getByLabelText('Back to landing'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getByTestId('browse-search-input')).toBeTruthy();
  });

  it('does not cover the guest map with an empty panel during an auth back swipe', async () => {
    render(<App />);

    await screen.findByTestId('complete-splash-intro');

    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Open customer login'));
    expect(screen.getByText('Auth screen')).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const swipeHandler = screen.getAllByTestId('mock-pan-gesture-handler').find((handler) => handler.props.enabled);
    expect(swipeHandler).toBeDefined();

    act(() => {
      swipeHandler?.props.onGestureEvent({ nativeEvent: { translationX: 120 } });
    });

    expect(screen.getByTestId('mock-map-view')).toBeTruthy();
    expect(screen.queryByTestId('incoming-onboarding-screen')).toBeNull();
  });

  it('restores guest chrome after completing an auth back swipe to the map', async () => {
    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Open customer login'));
    expect(screen.getByText('Auth screen')).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const swipeHandler = screen.getAllByTestId('mock-pan-gesture-handler').find((handler) => handler.props.enabled);
    expect(swipeHandler).toBeDefined();

    act(() => {
      swipeHandler?.props.onGestureEvent({ nativeEvent: { translationX: 240 } });
      swipeHandler?.props.onHandlerStateChange({
        nativeEvent: {
          oldState: 4,
          state: 5,
          translationX: 240,
          velocityX: 0,
        },
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

    expect(screen.getByTestId('browse-search-input')).toBeTruthy();
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText('Sign Up')).toBeTruthy();
    expect(screen.getByText('Business')).toBeTruthy();
  });

  it('restores guest chrome after completing a sign-up back swipe to the map', async () => {
    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Create a free account'));
    expect(screen.getByText('Create profile screen')).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const swipeHandler = screen.getAllByTestId('mock-pan-gesture-handler').find((handler) => handler.props.enabled);
    expect(swipeHandler).toBeDefined();

    act(() => {
      swipeHandler?.props.onGestureEvent({ nativeEvent: { translationX: 240 } });
      swipeHandler?.props.onHandlerStateChange({
        nativeEvent: {
          oldState: 4,
          state: 5,
          translationX: 240,
          velocityX: 0,
        },
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

    expect(screen.getByTestId('browse-search-input')).toBeTruthy();
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText('Sign Up')).toBeTruthy();
    expect(screen.getByText('Business')).toBeTruthy();
  });

  it('renders map pins only after the splash-to-map fade completes', async () => {
    const startAnimatingNodeMock = NativeModules.NativeAnimatedModule.startAnimatingNode as jest.Mock;
    const originalStartAnimatingNode = startAnimatingNodeMock.getMockImplementation();
    const pendingAnimationCallbacks: Array<(result: { finished: boolean }) => void> = [];
    startAnimatingNodeMock.mockImplementation((...args: unknown[]) => {
      pendingAnimationCallbacks.push(args[3] as (result: { finished: boolean }) => void);
    });

    try {
      render(<App />);

      await screen.findByTestId('complete-splash-intro');

      fireEvent.press(screen.getByTestId('complete-splash-intro'));

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 25));
      });

      expect(screen.getByTestId('mock-map-view')).toBeTruthy();
      expect(screen.queryAllByTestId('mock-map-marker')).toHaveLength(0);

      act(() => {
        pendingAnimationCallbacks.splice(0).forEach((callback) => callback({ finished: true }));
      });

      await act(async () => {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 25));
      });

      expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);
    } finally {
      if (originalStartAnimatingNode) {
        startAnimatingNodeMock.mockImplementation(originalStartAnimatingNode);
      } else {
        startAnimatingNodeMock.mockReset();
      }
    }
  });

  it('preserves browse filters after leaving and returning to the authenticated map', async () => {
    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Open customer login'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Submit login'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(await screen.findByText('Dashboard screen')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Open places'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    fireEvent.press(screen.getByLabelText('Open map'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    fireEvent.press(screen.getByTestId('browse-filters-toggle'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    fireEvent.press(screen.getByTestId('browse-confirmed-deals-filter'));
    fireEvent.press(screen.getByTestId('browse-city-filter-camarillo'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.getByTestId('browse-summary-label').props.children).toBe('Camarillo');

    fireEvent.press(screen.getByLabelText('Open profile'));
    expect(await screen.findByText('Dashboard screen')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Open places'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByTestId('browse-summary-label').props.children).toBe('Camarillo');
  });

  it('treats repeated favorite business taps as one immediate navigation', async () => {
    const refreshedSession: SignupResponse = {
      id: 7,
      username: 'guestfan',
      email: 'guestfan@example.com',
      first_name: 'Guest',
      last_name: 'Fan',
      auth_token: 'token-123',
      portal: 'customer',
      profile_type: 'customer',
      email_verified: true,
      two_factor_enabled: false,
      can_access_places: true,
      favorite_businesses: [],
    };
    let resolveDashboardRefresh: ((session: SignupResponse) => void) | null = null;
    const dashboardRefreshPromise = new Promise<SignupResponse>((resolve) => {
      resolveDashboardRefresh = resolve;
    });

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Open customer login'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Submit login'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(await screen.findByText('Dashboard screen')).toBeTruthy();
    mockFetchProfileDashboard.mockClear();
    mockFetchProfileDashboard.mockReturnValue(dashboardRefreshPromise);

    const favoriteBusinessesButton = screen.getByLabelText('Open favorite businesses');
    fireEvent.press(favoriteBusinessesButton);
    fireEvent.press(favoriteBusinessesButton);
    fireEvent.press(favoriteBusinessesButton);

    expect(mockFetchProfileDashboard).toHaveBeenCalledTimes(0);
    expect(await screen.findByText('Favorite businesses screen')).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    expect(mockFetchProfileDashboard).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveDashboardRefresh?.(refreshedSession);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('filters authenticated list and map views to the customer favorite businesses', async () => {
    mockFetchPlaces.mockResolvedValue([samplePlace, secondSamplePlace, thirdSamplePlace]);
    mockLoginProfile.mockResolvedValue({
      id: 7,
      username: 'guestfan',
      email: 'guestfan@example.com',
      first_name: 'Guest',
      last_name: 'Fan',
      auth_token: 'token-123',
      portal: 'customer',
      profile_type: 'customer',
      email_verified: true,
      two_factor_enabled: false,
      can_access_places: true,
      favorite_businesses: [{
        slug: secondSamplePlace.slug,
        name: secondSamplePlace.name,
        city: secondSamplePlace.city,
        city_label: secondSamplePlace.city_label,
        venue_type: secondSamplePlace.venue_type,
        venue_type_label: secondSamplePlace.venue_type_label,
        address_line_1: secondSamplePlace.address_line_1,
        website_url: secondSamplePlace.website_url,
      }],
    });

    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Open customer login'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Submit login'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(await screen.findByText('Dashboard screen')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Open places'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    fireEvent.press(screen.getByLabelText('Open map'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    fireEvent.press(screen.getByTestId('browse-list-mode'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    fireEvent.press(screen.getByTestId('browse-filters-toggle'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(screen.getByTestId('browse-favorite-businesses-filter')).toBeTruthy();
    fireEvent.press(screen.getByTestId('browse-favorite-businesses-filter'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.getByText(secondSamplePlace.name)).toBeTruthy();
    expect(screen.queryByText(samplePlace.name)).toBeNull();
    expect(screen.queryByText(thirdSamplePlace.name)).toBeNull();
    expect(screen.getByTestId('browse-summary-label').props.children).toContain('Favorite Businesses');

    fireEvent.press(screen.getByTestId('browse-map-mode'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);
    expect(screen.getByTestId('mock-map-marker').props.coordinate).toEqual({
      latitude: secondSamplePlace.latitude,
      longitude: secondSamplePlace.longitude,
    });
    expect(screen.getByTestId('browse-summary-label').props.children).toContain('Favorite Businesses');
  });

  it('returns to the login screen after logout and restores the previous guest map without restarting splash', async () => {
    const view = render(<App />);

    await screen.findByTestId('complete-splash-intro');

    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Open customer login'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Submit login'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(await screen.findByText('Dashboard screen')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Open settings'));
    expect(screen.getByText('Settings screen')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Log out'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByText('Auth screen')).toBeTruthy();
    expect(screen.queryByText('Settings screen')).toBeNull();

    fireEvent.press(screen.getByLabelText('Back to landing'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getByTestId('browse-search-input')).toBeTruthy();
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.queryByText('Auth screen')).toBeNull();
    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    view.unmount();
  });

  it('clears place state and caches after permanently deleting an account', async () => {
    render(<App />);

    await screen.findByTestId('complete-splash-intro');
    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getAllByTestId('mock-map-marker')).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('Open customer login'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Submit login'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    fireEvent.press(screen.getByLabelText('Open settings'));
    fireEvent.press(screen.getByLabelText('Set delete password'));
    fireEvent.press(screen.getByLabelText('Delete account'));

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockDeleteProfileAccount).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api',
      'token-123',
      'password123',
    );
    expect(mockClearPlacesCache).toHaveBeenCalledTimes(1);
    expect(mockClearPersistedPlaceCache).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Auth screen')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Back to landing'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getByTestId('browse-search-input')).toBeTruthy();
    expect(screen.queryAllByTestId('mock-map-marker')).toHaveLength(0);
  });
});