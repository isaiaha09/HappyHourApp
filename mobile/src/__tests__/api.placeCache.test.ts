import { clearPlacesCache, fetchPlaces } from '../api';

const dynamicPlace = {
  id: 1,
  name: 'Scoops Truck',
  slug: 'scoops-truck',
  is_claimed: true,
  city: 'ventura',
  city_label: 'Ventura',
  venue_type: 'mobile',
  venue_type_label: 'Mobile Vendor',
  address_line_1: 'Approximate live location',
  address_line_2: '',
  neighborhood: '',
  state: 'CA',
  postal_code: '',
  latitude: 34.2789,
  longitude: -119.2914,
  phone_number: '',
  website_url: '',
  image_urls: [],
  operating_hours: [],
  is_active: true,
  has_deals: false,
  deal_count: 0,
  operating_weekdays: [],
  deal_weekdays: [],
  is_verified: true,
  locations: [{
    id: 2,
    name: 'Scoops Truck',
    slug: 'scoops-truck-ventura',
    city: 'ventura',
    city_label: 'Ventura',
    venue_type: 'mobile',
    venue_type_label: 'Mobile Vendor',
    address_line_1: 'Approximate live location',
    address_line_2: '',
    neighborhood: '',
    state: 'CA',
    postal_code: '',
    latitude: 34.2789,
    longitude: -119.2914,
    phone_number: '',
    website_url: '',
    image_urls: [],
    operating_hours: [],
    is_active: true,
    has_deals: false,
    deal_count: 0,
    operating_weekdays: [],
    deal_weekdays: [],
    is_verified: true,
  }],
};

const staticPlace = {
  ...dynamicPlace,
  id: 3,
  name: 'Static Cafe',
  slug: 'static-cafe',
  venue_type: 'cafe',
  venue_type_label: 'Cafe',
  latitude: 34.2,
  longitude: -119.2,
  locations: [{
    ...dynamicPlace.locations[0],
    id: 4,
    name: 'Static Cafe',
    slug: 'static-cafe-ventura',
    venue_type: 'cafe',
    venue_type_label: 'Cafe',
    latitude: 34.2,
    longitude: -119.2,
  }],
};

const serviceAreaPlace = {
  ...dynamicPlace,
  id: 5,
  name: 'Scoops Catering',
  slug: 'scoops-catering',
  venue_type: 'fast_food',
  venue_type_label: 'Fast Food',
  serves_multiple_areas: true,
  locations: [{
    ...dynamicPlace.locations[0],
    id: 6,
    name: 'Scoops Catering',
    slug: 'scoops-catering',
    venue_type: 'fast_food',
    venue_type_label: 'Fast Food',
  }],
};

describe('fetchPlaces dynamic coordinate cache', () => {
  beforeEach(() => {
    clearPlacesCache();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ count: 3, next: null, results: [dynamicPlace, staticPlace, serviceAreaPlace] }),
    } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearPlacesCache();
  });

  it('never returns or caches dynamic business coordinates from the full places response', async () => {
    const firstResult = await fetchPlaces('https://api.example.com', 'all');
    const cachedResult = await fetchPlaces('https://api.example.com', 'all');

    expect(firstResult[0]).toEqual(expect.objectContaining({ latitude: null, longitude: null }));
    expect(firstResult[0].locations[0]).toEqual(expect.objectContaining({ latitude: null, longitude: null }));
    expect(cachedResult[0]).toEqual(expect.objectContaining({ latitude: null, longitude: null }));
    expect(cachedResult[0].locations[0]).toEqual(expect.objectContaining({ latitude: null, longitude: null }));
    expect(cachedResult[1]).toEqual(expect.objectContaining({ latitude: 34.2, longitude: -119.2 }));
    expect(cachedResult[2]).toEqual(expect.objectContaining({ latitude: null, longitude: null }));
    expect(cachedResult[2].locations[0]).toEqual(expect.objectContaining({ latitude: null, longitude: null }));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
