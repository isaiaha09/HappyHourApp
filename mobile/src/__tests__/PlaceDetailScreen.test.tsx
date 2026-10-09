import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PlaceDetailScreen } from '../screens/PlaceDetailScreen';
import { styles } from '../appStyles';
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

jest.mock('../utils/nativePdfViewer', () => ({
  preparePdfForPreview: jest.fn().mockResolvedValue({
    uri: 'file:///private/cache/deal-preview.pdf',
    cleanup: jest.fn(async () => undefined),
  }),
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
  it('shows service-area and mobile-vendor labels in a wrapping header row', () => {
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
          venue_type: 'mobile',
          venue_type_label: 'Serves Multiple Locations / Mobile Business',
        })}
        selectedPlaceDeals={[]}
        selectedPlaceLocation={null}
        selectedPlaceOperatingHours={[]}
        showFavoriteControl={false}
      />,
    );

    const cityCategoryRow = screen.getByTestId('public-profile-city-category-row');
    const locationsLabel = screen.getByText('Serves Multiple Locations');
    const locationsLabelStyle = StyleSheet.flatten(locationsLabel.props.style);
    const mobileVendorLabel = screen.getByText('Mobile Vendor');

    expect(locationsLabelStyle.color).toBe(StyleSheet.flatten(styles.detailCity).color);
    expect(StyleSheet.flatten(cityCategoryRow.props.style).flexWrap).toBe('wrap');
    expect(locationsLabel.props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(mobileVendorLabel.props.style)).toMatchObject({
      backgroundColor: StyleSheet.flatten(styles.publicProfileCategory).backgroundColor,
      borderWidth: 1,
    });
    expect(screen.queryByText(/Mobile Business|\.\.\./)).toBeNull();
  });

  it('omits the photo section when no business photos are available', () => {
    const commonProps = {
      detailLoading: false,
      errorMessage: null,
      favoriteHelperText: null,
      favoriteSubmitting: false,
      isLandscape: false,
      isFavorited: false,
      locationStatusNow: Date.parse('2026-08-03T17:33:20Z'),
      onBack: jest.fn(),
      onSelectLocation: jest.fn(),
      onToggleFavorite: jest.fn(),
      selectedPlaceDeals: [],
      selectedPlaceLocation: null,
      selectedPlaceOperatingHours: [],
      showFavoriteControl: false,
    };
    const { rerender } = render(
      <PlaceDetailScreen {...commonProps} selectedPlace={buildPlace()} />,
    );

    expect(screen.queryByTestId('profile-photo-gallery')).toBeNull();
    expect(screen.queryByText('Photos')).toBeNull();

    rerender(
      <PlaceDetailScreen
        {...commonProps}
        selectedPlace={buildPlace({ image_urls: ['https://example.com/business.jpg'] })}
      />,
    );

    expect(screen.getByTestId('profile-photo-gallery')).toBeTruthy();
    expect(screen.getByText('Photos')).toBeTruthy();
  });

  it('automatically formats multiple returned deals and more-offer entries', () => {
    const baseDeal: Deal = {
      id: 1,
      title: 'Short deal',
      description: 'A simple happy hour.',
      deal_type: 'special',
      deal_type_label: 'Special',
      price_text: '$5',
      terms: 'Dine in only.',
      attachment: null,
      is_active: true,
      starts_on: null,
      ends_on: null,
      happy_hours: [],
    };

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
        selectedPlace={buildPlace({ offer_entries: ['Tuesday - tacos || Wednesday - wings || Terms: ask staff'] })}
        selectedPlaceDeals={[
          baseDeal,
          { ...baseDeal, id: 2, title: 'Combo deal', description: 'Thursday - $15 combo || Friday - $17 combo || Saturday - $19 combo' },
          { ...baseDeal, id: 3, title: 'Irregular deal', description: 'See staff / menu for details.' },
        ]}
        selectedPlaceLocation={null}
        selectedPlaceOperatingHours={[]}
        showFavoriteControl={false}
      />,
    );

    expect(screen.getByText('A simple happy hour.')).toBeTruthy();
    expect(screen.getByText('See staff / menu for details.')).toBeTruthy();
    expect(screen.getByText('$15 combo')).toBeTruthy();
    expect(screen.queryByText('$19 combo')).toBeNull();
    expect(screen.getAllByText('Terms: Dine in only.')).toHaveLength(3);
    expect(screen.getByText('More Deals and Specials')).toBeTruthy();
    expect(screen.getAllByText('Show all details')).toHaveLength(2);

    fireEvent.press(screen.getAllByText('Show all details')[0]);
    expect(screen.getByText('$19 combo')).toBeTruthy();
    fireEvent.press(screen.getByText('Show all details'));
    expect(screen.getByText('Terms: ask staff')).toBeTruthy();
  });

  it('opens a deal PDF in the in-app read-only viewer when tapped', async () => {
    const deal: Deal = {
      id: 8,
      title: 'Happy Hour Menu',
      description: '',
      deal_type: 'special',
      deal_type_label: 'Special',
      price_text: '',
      terms: '',
      attachment: {
        content_type: 'application/pdf',
        file_size: 3 * 1024 * 1024,
        name: 'Happy Hour Menu.pdf',
        url: 'https://cdn.example.test/happy-hour-menu.pdf',
      },
      is_active: true,
      starts_on: null,
      ends_on: null,
      happy_hours: [],
    };

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
        selectedPlaceDeals={[deal]}
        selectedPlaceLocation={null}
        selectedPlaceOperatingHours={[]}
        showFavoriteControl={false}
      />,
    );

    fireEvent.press(screen.getByText('PDF · 3 MB · 10 MB max · Tap to view'));

    await waitFor(() => {
      expect(screen.getByTestId('readonly-pdf-view')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Close PDF preview' })).toBeTruthy();
    });
    expect(within(screen.getByTestId('pdf-preview-header')).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(/download|save|share/i)).toBeNull();
  });

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
        onAddToCalendar={jest.fn()}
        onSharePlace={jest.fn()}
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
            facebook: {
              url: 'https://facebook.com/orderbistro',
              username: 'orderbistro',
            },
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
        showFavoriteControl
      />,
    );

    const businessHeader = screen.getByTestId('business-profile-header-controls');
    expect(StyleSheet.flatten(businessHeader.props.style)).toMatchObject({
      flexDirection: 'row',
      justifyContent: 'space-between',
    });
    expect(within(businessHeader).getByLabelText('Add Order Bistro to Calendar')).toBeTruthy();
    expect(within(businessHeader).getByLabelText('Share Order Bistro')).toBeTruthy();
    expect(within(businessHeader).getByLabelText('Add to favorites')).toBeTruthy();
    expect(within(businessHeader).getByLabelText('Report business content')).toBeTruthy();
    expect(within(businessHeader).queryByText('Restaurant')).toBeNull();

    const cityCategoryRow = screen.getByTestId('public-profile-city-category-row');
    expect(StyleSheet.flatten(cityCategoryRow.props.style)).toMatchObject({
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    });
    expect(within(cityCategoryRow).getByText('Oxnard')).toBeTruthy();
    expect(within(cityCategoryRow).getByText('Restaurant')).toBeTruthy();

    const socialList = screen.getByTestId('public-profile-social-list');
    expect(StyleSheet.flatten(socialList.props.style)).toMatchObject({
      alignSelf: 'stretch',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      width: '100%',
    });
    expect(StyleSheet.flatten(styles.publicProfileSocialCard)).toMatchObject({
      flexBasis: '47%',
      minWidth: 0,
      width: '47%',
    });

    const dealHeader = screen.getByTestId('public-profile-deal-header-7');
    expect(StyleSheet.flatten(dealHeader.props.style)).toMatchObject({
      justifyContent: 'space-between',
    });
    const dealActions = screen.getByTestId('public-profile-deal-actions-7');
    expect(StyleSheet.flatten(dealActions.props.style)).toMatchObject({
      justifyContent: 'flex-start',
    });
    expect(within(dealHeader).getByLabelText('Add Order Deal to Calendar')).toBeTruthy();
    expect(within(dealHeader).getByLabelText('Share Order Deal')).toBeTruthy();
    expect(within(dealHeader).getByText('Special')).toBeTruthy();

    const renderedOutput = JSON.stringify(screen.toJSON());
    expect(renderedOutput.indexOf('"Add Order Deal to Calendar"')).toBeLessThan(
      renderedOutput.indexOf('"Order Deal"'),
    );
    const orderedLabels = [
      'Oxnard',
      'Restaurant',
      'Order Bistro',
      'Photos',
      'Current Deals',
      'Order Deal',
      'Hours of Operations',
      '123 Main Street, Oxnard, CA 93030',
      '2 miles away',
      'Tap to open in Maps',
      'Social Media',
      'instagram:order-bistro',
      'facebook:orderbistro',
    ];

    let previousIndex = -1;
    orderedLabels.forEach((label) => {
      const nextIndex = renderedOutput.indexOf(JSON.stringify(label));
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
