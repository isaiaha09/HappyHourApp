import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

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

jest.mock('../screens/SplashScreen', () => ({
  SplashScreen: ({ onOpenMap }: { onOpenMap: () => void }) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');

    return (
      <Pressable onPress={onOpenMap} testID="open-map-from-splash">
        <Text>Open Map</Text>
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
  AuthPortalScreen: () => null,
  BusinessClaimReviewPendingScreen: () => null,
  BusinessSearchScreen: () => null,
  BusinessVerificationScreen: () => null,
  ContactSupportScreen: () => null,
  CreateProfileScreen: () => null,
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
  const setMapBoundariesMock = jest.fn();

  const MapView = React.forwardRef(({
    children,
    testID,
  }: {
    children?: React.ReactNode;
    testID?: string;
  }, ref: React.ForwardedRef<{ animateToRegion: jest.Mock; setMapBoundaries: jest.Mock }>) => {
    React.useImperativeHandle(ref, () => ({
      animateToRegion: animateToRegionMock,
      setMapBoundaries: setMapBoundariesMock,
    }));

    return <View testID={testID ?? 'mock-map-view'}>{children}</View>;
  });

  const Marker = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;

  return {
    __esModule: true,
    default: MapView,
    Marker,
    __mock: {
      animateToRegionMock,
      setMapBoundariesMock,
    },
  };
});

import App from '../../App';

const mapsModule = jest.requireMock('react-native-maps') as {
  __mock: {
    animateToRegionMock: jest.Mock;
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
    mapsModule.__mock.setMapBoundariesMock.mockClear();
  });

  afterEach(() => {
    mockFetchPlaces.mockReset();
  });

  it('does not trigger additional map auto-fit animations for gibberish no-match searches', async () => {
    render(<App />);

    fireEvent.press(screen.getByTestId('open-map-from-splash'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mockFetchPlaces).toHaveBeenCalled();
    expect(screen.getByTestId('browse-search-input')).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

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
});