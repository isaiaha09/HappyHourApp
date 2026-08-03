import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, NativeModules } from 'react-native';

import type { PlaceListItem } from '../types';

type MockNetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
};

const mockFetchPlaces = jest.fn<Promise<PlaceListItem[]>, [string, string]>();
const mockFetchLiveLocationPlaces = jest.fn<Promise<Array<{ slug: string; latitude: number | null; longitude: number | null; updated_at: string | null }>>, [string, string]>();
const mockFetchProfileDashboard = jest.fn();
const mockLoginProfile = jest.fn();
const mockRegisterPushDevice = jest.fn();
let mockNotificationResponseListener: ((response: unknown) => void) | null = null;
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
  clearPlacesCache: jest.fn(),
  confirmTwoFactorSetup: jest.fn(),
  createBusinessProfile: jest.fn(),
  createCustomerProfile: jest.fn(),
  createInformalBusinessProfile: jest.fn(),
  createManualBusinessProfile: jest.fn(),
  deleteProfileAccount: jest.fn(),
  disableTwoFactor: jest.fn(),
  fetchFeed: jest.fn(),
  fetchLiveLocationPlaces: (...args: [string, string]) => mockFetchLiveLocationPlaces(...args),
  fetchPlaceDetail: jest.fn(),
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
  updateBusinessLocation: jest.fn(),
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
  getForegroundPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
  watchPositionAsync: jest.fn(),
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
  Ionicons: () => null,
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
  AccountSettingsScreen: ({ onLogout }: { onLogout: () => void }) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return (
      <View>
        <Text>Settings screen</Text>
        <Pressable accessibilityLabel="Log out" onPress={onLogout}>
          <Text>Log out</Text>
        </Pressable>
      </View>
    );
  },
  BusinessProfileEditorScreen: () => null,
  DashboardScreen: ({ onOpenPlaces, onOpenSettings }: { onOpenPlaces: () => void; onOpenSettings: () => void }) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return (
      <View>
        <Text>Dashboard screen</Text>
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
  PlaceDetailScreen: () => null,
}));

jest.mock('../businessLocationTracking', () => ({
  clearPersistedBusinessTrackingSession: jest.fn(async () => undefined),
  ensureBusinessBackgroundLocationTaskStarted: jest.fn(async () => undefined),
  loadPersistedBusinessTrackingSession: jest.fn(async () => null),
  stopBusinessBackgroundLocationTask: jest.fn(async () => undefined),
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

  const Marker = ({ children }: { children?: React.ReactNode }) => <View testID="mock-map-marker">{children}</View>;

  return {
    __esModule: true,
    default: MapView,
    Marker,
    __mock: {
      animateToRegionMock,
      initialRegionMock,
      setMapBoundariesMock,
    },
  };
});

import App from '../../App';

const mapsModule = jest.requireMock('react-native-maps') as {
  __mock: {
    animateToRegionMock: jest.Mock;
    initialRegionMock: jest.Mock;
    setMapBoundariesMock: jest.Mock;
  };
};
const networkModule = jest.requireMock('expo-network') as {
  __setMockNetworkState: (nextState: { isConnected?: boolean; isInternetReachable?: boolean; type?: string }) => void;
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
    mockFetchProfileDashboard.mockResolvedValue(null);
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
    mapsModule.__mock.animateToRegionMock.mockClear();
    mapsModule.__mock.initialRegionMock.mockClear();
    mapsModule.__mock.setMapBoundariesMock.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockNetworkListeners.clear();
    mockFetchPlaces.mockReset();
    mockFetchLiveLocationPlaces.mockReset();
    mockFetchProfileDashboard.mockReset();
    mockLoginProfile.mockReset();
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
});