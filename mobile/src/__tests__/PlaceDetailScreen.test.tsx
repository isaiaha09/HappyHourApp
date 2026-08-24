import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { PlaceDetailScreen } from '../screens/PlaceDetailScreen';
import type { Deal, PlaceDetail } from '../types';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    Marker: View,
    default: View,
  };
});

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return <Text testID={`icon-${name}`}>{name}</Text>;
  },
}));

jest.mock('../components/NativeIOSLiquidGlass', () => ({
  NativeIOSLiquidGlassHeaderButton: ({ fallback }: { fallback: React.ReactNode }) => fallback,
}));

jest.mock('../components/PhotoLightbox', () => ({
  PhotoLightbox: () => null,
}));

jest.mock('../components/SocialButton', () => ({
  SocialButton: ({ platform, username }: { platform: string; username: string }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return <Text>{`${platform}:${username}`}</Text>;
  },
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

  it('renders the owner live map card while the API detail still has no coordinates', () => {
    render(
      <PlaceDetailScreen
        detailLoading={false}
        errorMessage={null}
        favoriteHelperText={null}
        favoriteSubmitting={false}
        isLandscape={false}
        isFavorited={false}
        liveLocationOverride={{ latitude: 34.2789, longitude: -119.2914 }}
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

    expect(screen.getByText('Tap to open in Maps')).toBeTruthy();
  });

  it('renders the website and social profiles as proper profile links', () => {
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
        selectedPlace={buildPlace({
          social_profiles: {
            instagram: {
              url: 'https://instagram.com/yardhouseoxnard',
              username: 'yardhouseoxnard',
            },
          },
          website_url: 'https://www.yardhouse.com/oxnard',
        })}
        selectedPlaceDeals={[]}
        selectedPlaceLocation={null}
        selectedPlaceOperatingHours={[]}
        showFavoriteControl={false}
      />,
    );

    expect(screen.getByText('instagram:yardhouseoxnard')).toBeTruthy();
    expect(screen.getByText('website:yardhouse.com')).toBeTruthy();
    expect(screen.queryByText('Open website')).toBeNull();
  });

  it('renders the business profile sections in the requested order', () => {
    const deal: Deal = {
      id: 7,
      title: 'Order Deal',
      description: '',
      deal_type: 'special',
      deal_type_label: 'Special',
      price_text: '',
      terms: '',
      attachment: null,
      is_active: true,
      starts_on: null,
      ends_on: null,
      happy_hours: [],
    };

    render(
      <PlaceDetailScreen
        detailLoading={false}
        distanceLabel="2 miles away"
        errorMessage={null}
        favoriteHelperText={null}
        favoriteSubmitting={false}
        isLandscape={false}
        isFavorited={false}
        locationStatusNow={Date.parse('2026-08-03T17:33:20Z')}
        onBack={jest.fn()}
        onSelectLocation={jest.fn()}
        onToggleFavorite={jest.fn()}
        selectedPlace={buildPlace({
          address_line_1: '123 Main Street',
          city_label: 'Oxnard',
          image_urls: ['https://example.com/order-bistro.jpg'],
          latitude: 34.2,
          longitude: -119.2,
          name: 'Order Bistro',
          social_profiles: {
            instagram: {
              url: 'https://instagram.com/order-bistro',
              username: 'order-bistro',
            },
          },
          state: 'CA',
          postal_code: '93030',
          venue_type_label: 'Restaurant',
        })}
        selectedPlaceDeals={[deal]}
        selectedPlaceLocation={null}
        selectedPlaceOperatingHours={[{
          close_time: '10:00 PM',
          group_id: 'hours-1',
          group_rank: 0,
          id: 8,
          open_time: '9:00 AM',
          weekday: 1,
          weekday_label: 'Monday',
        }]}
        showFavoriteControl={false}
      />,
    );

    const renderedOutput = JSON.stringify(screen.toJSON());
    const orderedLabels = [
      'Order Bistro',
      'Restaurant',
      'Photos',
      'Current Deals',
      'Order Deal',
      'Hours of Operations',
      '123 Main Street, Oxnard, CA 93030',
      '2 miles away',
      'Tap to open in Maps',
      'Social Media',
      'instagram:order-bistro',
    ];

    let previousIndex = -1;
    orderedLabels.forEach((label) => {
      const nextIndex = renderedOutput.indexOf(label);
      expect(nextIndex).toBeGreaterThan(previousIndex);
      previousIndex = nextIndex;
    });
  });
});

describe('PlaceDetailScreen favorites', () => {
  it('renders the recovered star badge for an admin-starred business', () => {
    const { toJSON } = render(
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
        selectedPlace={buildPlace({ is_claimed: true, is_starred: true })}
        selectedPlaceDeals={[]}
        selectedPlaceLocation={null}
        selectedPlaceOperatingHours={[]}
        showFavoriteControl
      />,
    );

    expect(screen.getByLabelText('Starred business')).toBeTruthy();
    expect(screen.getByLabelText('Claimed business')).toBeTruthy();
    expect(screen.getByLabelText('Add to favorites')).toBeTruthy();
    expect(screen.getByLabelText('Report business content')).toBeTruthy();
    expect(screen.getByText('★')).toBeTruthy();
    const renderedOutput = JSON.stringify(toJSON());
    expect(renderedOutput.indexOf('★')).toBeLessThan(renderedOutput.indexOf('Startup Scoops'));
  });

  it('renders an outline heart when the business is not favorited', () => {
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
        showFavoriteControl
      />,
    );

    expect(screen.getByTestId('icon-heart-outline')).toBeTruthy();
    expect(screen.queryByTestId('icon-heart')).toBeNull();
  });

  it('renders a filled heart when the business is favorited', () => {
    render(
      <PlaceDetailScreen
        detailLoading={false}
        errorMessage={null}
        favoriteHelperText={null}
        favoriteSubmitting={false}
        isLandscape={false}
        isFavorited
        locationStatusNow={Date.parse('2026-08-03T17:33:20Z')}
        onBack={jest.fn()}
        onSelectLocation={jest.fn()}
        onToggleFavorite={jest.fn()}
        selectedPlace={buildPlace()}
        selectedPlaceDeals={[]}
        selectedPlaceLocation={null}
        selectedPlaceOperatingHours={[]}
        showFavoriteControl
      />,
    );

    expect(screen.getByTestId('icon-heart')).toBeTruthy();
    expect(screen.queryByTestId('icon-heart-outline')).toBeNull();
  });
});
