import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { PlaceDetailScreen } from '../screens/PlaceDetailScreen';
import type { PlaceDetail } from '../types';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  return {
    Marker: View,
    default: View,
  };
});

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../components/NativeIOSLiquidGlass', () => ({
  NativeIOSLiquidGlassHeaderButton: ({ fallback }: { fallback: React.ReactNode }) => fallback,
}));

jest.mock('../components/PhotoLightbox', () => ({
  PhotoLightbox: () => null,
}));

jest.mock('../components/SocialButton', () => ({
  SocialButton: () => null,
}));

function buildPlace(overrides: Partial<PlaceDetail> = {}) {
  return {
    id: 42,
    name: 'Startup Scoops',
    slug: 'startup-scoops',
    city: 'ventura',
    city_label: '',
    venue_type: 'food_truck',
    venue_type_label: 'Food Truck',
    address_line_1: 'Approximate live location near Main Street',
    address_line_2: '',
    neighborhood: '',
    state: 'CA',
    postal_code: '',
    latitude: null,
    longitude: null,
    live_location_updated_at: '2026-08-03T17:28:20Z',
    phone_number: '',
    website_url: '',
    image_urls: [],
    operating_hours: [],
    is_active: true,
    has_deals: false,
    deal_count: 0,
    operating_weekdays: [],
    deal_weekdays: [],
    is_verified: false,
    is_claimed: false,
    is_informal: true,
    locations: [],
    deals: [],
    ...overrides,
  } as PlaceDetail;
}

describe('PlaceDetailScreen live location messaging', () => {
  it('shows the stale approximate location and hides Google Reviews for informal profiles', () => {
    render(
      <PlaceDetailScreen
        detailLoading={false}
        errorMessage={null}
        favoriteHelperText={null}
        favoriteSubmitting={false}
        isLandscape={false}
        isFavorited={false}
        locationStatusNow={Date.parse('2026-08-03T17:33:20Z')}
        onBack={jest.fn()}
        onSelectLocation={jest.fn()}
        onToggleFavorite={jest.fn()}
        selectedPlace={buildPlace()}
        selectedPlaceDeals={[]}
        selectedPlaceLocation={null}
        selectedPlaceOperatingHours={[]}
        showFavoriteControl={false}
      />,
    );

    expect(screen.getByText('Last known location: Approximate live location near Main Street, CA approximately 5 minutes ago')).toBeTruthy();
    expect(screen.queryByText('View Google Reviews')).toBeNull();
  });

  it('hides the last known location message after a fresh reconnect update', () => {
    render(
      <PlaceDetailScreen
        detailLoading={false}
        errorMessage={null}
        favoriteHelperText={null}
        favoriteSubmitting={false}
        isLandscape={false}
        isFavorited={false}
        locationStatusNow={Date.parse('2026-08-03T17:33:20Z')}
        onBack={jest.fn()}
        onSelectLocation={jest.fn()}
        onToggleFavorite={jest.fn()}
        selectedPlace={buildPlace({ live_location_updated_at: '2026-08-03T17:33:00Z' })}
        selectedPlaceDeals={[]}
        selectedPlaceLocation={null}
        selectedPlaceOperatingHours={[]}
        showFavoriteControl={false}
      />,
    );

    expect(screen.queryByText(/Last known location:/)).toBeNull();
  });
});