import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NativeModules } from 'react-native';

import type { PlaceListItem } from '../types';

const mockFetchPlaces = jest.fn<Promise<PlaceListItem[]>, [string, string]>();

jest.mock('../api', () => ({
  beginTwoFactorSetup: jest.fn(),
  confirmTwoFactorSetup: jest.fn(),
  createBusinessProfile: jest.fn(),
  createCustomerProfile: jest.fn(),
  createInformalBusinessProfile: jest.fn(),
  createManualBusinessProfile: jest.fn(),
  deleteProfileAccount: jest.fn(),
  disableTwoFactor: jest.fn(),
  fetchFeed: jest.fn(),
  fetchPlaceDetail: jest.fn(),
  fetchPlaces: (...args: [string, string]) => mockFetchPlaces(...args),
  fetchProfileDashboard: jest.fn(),
  getDefaultApiBaseUrl: jest.fn(() => 'http://127.0.0.1:8000/api'),
  loginProfile: jest.fn(),
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
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test-token]' })),
  requestPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
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
  AccountSettingsScreen: () => null,
  BusinessProfileEditorScreen: () => null,
  DashboardScreen: () => null,
}));

jest.mock('../screens/PlaceDetailScreen', () => ({
  PlaceDetailScreen: () => null,
}));

jest.mock('../screens/ProfileFlowScreens', () => ({
  AuthPortalScreen: ({ onBackToLanding }: { onBackToLanding: () => void }) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return (
      <View>
        <Text>Auth screen</Text>
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
    mockFetchPlaces.mockResolvedValue([samplePlace]);
    mapsModule.__mock.animateToRegionMock.mockClear();
    mapsModule.__mock.initialRegionMock.mockClear();
    mapsModule.__mock.setMapBoundariesMock.mockClear();
  });

  afterEach(() => {
    mockFetchPlaces.mockReset();
  });

  it('does not trigger additional map auto-fit animations for gibberish no-match searches', async () => {
    render(<App />);

    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mockFetchPlaces).toHaveBeenCalled();
    expect(screen.getByTestId('browse-search-input')).toBeTruthy();
    expect(screen.getByText('Home Feed')).toBeTruthy();
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText('Sign Up')).toBeTruthy();
    expect(screen.getByText('Business')).toBeTruthy();
    expect(screen.getByLabelText('Switch to light map')).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mapsModule.__mock.initialRegionMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ latitude: samplePlace.latitude, longitude: samplePlace.longitude }),
    );
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

  it('returns guest sign-in and sign-up flows to the browse map', async () => {
    render(<App />);

    fireEvent.press(screen.getByTestId('complete-splash-intro'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    fireEvent.press(screen.getByLabelText('Open customer login'));
    expect(screen.getByText('Auth screen')).toBeTruthy();
    expect(screen.getByTestId('mock-map-view')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Back to landing'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getByTestId('browse-search-input')).toBeTruthy();
    expect(screen.queryByText('Auth screen')).toBeNull();

    fireEvent.press(screen.getByLabelText('Create a free account'));
    expect(screen.getByText('Create profile screen')).toBeTruthy();
    expect(screen.getByTestId('mock-map-view')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Back from profiles'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(screen.getByTestId('browse-search-input')).toBeTruthy();
    expect(screen.queryByText('Create profile screen')).toBeNull();
  });

  it('does not cover the guest map with an empty panel during an auth back swipe', async () => {
    render(<App />);

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
});