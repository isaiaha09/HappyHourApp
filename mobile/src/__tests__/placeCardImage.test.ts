import { getPlaceCardImageUrl } from '../placeHelpers';
import type { PlaceListItem } from '../types';

function buildPlace(overrides: Partial<PlaceListItem> = {}): PlaceListItem {
  return {
    id: 1,
    name: 'Test Place',
    slug: 'test-place',
    city: 'ventura',
    city_label: 'Ventura',
    venue_type: 'restaurant',
    venue_type_label: 'Restaurant',
    address_line_1: '123 Main St',
    address_line_2: '',
    neighborhood: '',
    state: 'CA',
    postal_code: '93001',
    latitude: 34.1,
    longitude: -119.2,
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
    locations: [],
    ...overrides,
  };
}

describe('getPlaceCardImageUrl', () => {
  it('returns the first top-level displayable image URL', () => {
    const place = buildPlace({
      image_urls: [
        'https://images.example.com/front.jpg',
        'https://images.example.com/patio.jpg',
      ],
    });

    expect(getPlaceCardImageUrl(place)).toBe('https://images.example.com/front.jpg');
  });

  it('skips video URLs and falls back to the next image', () => {
    const place = buildPlace({
      image_urls: [
        'https://images.example.com/hero.mp4',
        'https://images.example.com/front.jpg',
      ],
    });

    expect(getPlaceCardImageUrl(place)).toBe('https://images.example.com/front.jpg');
  });

  it('falls back to location-level images when top-level images are empty', () => {
    const place = buildPlace({
      locations: [
        {
          id: 11,
          name: 'Test Place',
          slug: 'test-place-ventura',
          city: 'ventura',
          city_label: 'Ventura',
          venue_type: 'restaurant',
          venue_type_label: 'Restaurant',
          address_line_1: '123 Main St',
          address_line_2: '',
          neighborhood: '',
          state: 'CA',
          postal_code: '93001',
          latitude: 34.1,
          longitude: -119.2,
          phone_number: '',
          website_url: '',
          image_urls: ['https://images.example.com/location.jpg'],
          operating_hours: [],
          is_active: true,
          has_deals: false,
          deal_count: 0,
          operating_weekdays: [],
          deal_weekdays: [],
          is_verified: false,
        },
      ],
    });

    expect(getPlaceCardImageUrl(place)).toBe('https://images.example.com/location.jpg');
  });
});