import { Linking } from 'react-native';

import { dedupeImageUrls, formatLastKnownLocationLabel, formatPlaceAddress, mergeLiveLocationUpdatesIntoPlaceDetail, mergeLiveLocationUpdatesIntoPlaces, openMapsAddress } from '../placeHelpers';
import type { PlaceDetail, PlaceListItem } from '../types';

describe('dedupeImageUrls', () => {
  it('removes exact duplicate URLs', () => {
    expect(dedupeImageUrls([
      'https://images.example.com/patio.jpg',
      'https://images.example.com/patio.jpg',
      'https://images.example.com/front.jpg',
    ])).toEqual([
      'https://images.example.com/patio.jpg',
      'https://images.example.com/front.jpg',
    ]);
  });

  it('dedupes Cloudflare resized variants of the same asset', () => {
    expect(dedupeImageUrls([
      'https://popmenucloud.com/cdn-cgi/image/width=1200,height=630,format=auto,fit=cover/tnwlafer/4e89a795-8a8b-48a0-881b-6cd0415f2bb7',
      'https://popmenucloud.com/cdn-cgi/image/width%3D1920%2Cheight%3D1920%2Cfit%3Dscale-down%2Cformat%3Dauto%2Cquality%3D20/tnwlafer/4e89a795-8a8b-48a0-881b-6cd0415f2bb7',
      'https://images.example.com/front.jpg',
    ])).toEqual([
      'https://popmenucloud.com/cdn-cgi/image/width=1200,height=630,format=auto,fit=cover/tnwlafer/4e89a795-8a8b-48a0-881b-6cd0415f2bb7',
      'https://images.example.com/front.jpg',
    ]);
  });

  it('dedupes query-based resize variants of the same file', () => {
    expect(dedupeImageUrls([
      'https://static1.squarespace.com/static/photo.png?format=1500w',
      'https://static1.squarespace.com/static/photo.png?format=2500w',
      'https://static1.squarespace.com/static/other-photo.png?format=1500w',
    ])).toEqual([
      'https://static1.squarespace.com/static/photo.png?format=1500w',
      'https://static1.squarespace.com/static/other-photo.png?format=1500w',
    ]);
  });

  it('dedupes path-based CDN size variants', () => {
    expect(dedupeImageUrls([
      'https://dynl.mktgcdn.com/p/SRFYEpCKcfTxj96Y-SCWNfTfDZoRu505ffHDrwtf86Y/500x500',
      'https://dynl.mktgcdn.com/p/SRFYEpCKcfTxj96Y-SCWNfTfDZoRu505ffHDrwtf86Y/100x67',
      'https://dynl.mktgcdn.com/p/another-asset/500x500',
    ])).toEqual([
      'https://dynl.mktgcdn.com/p/SRFYEpCKcfTxj96Y-SCWNfTfDZoRu505ffHDrwtf86Y/500x500',
      'https://dynl.mktgcdn.com/p/another-asset/500x500',
    ]);
  });
});

describe('mergeLiveLocationUpdatesIntoPlaces', () => {
  it('moves the rendered child location identified by the live endpoint slug', () => {
    const place = {
      latitude: 34.2,
      longitude: -119.1,
      locations: [{
        latitude: 34.2,
        longitude: -119.1,
        slug: 'scoops-truck-ventura',
      }],
      slug: 'scoops-truck',
    } as PlaceListItem;
    const staticPlace = {
      latitude: 34.3,
      longitude: -119.2,
      locations: [{
        latitude: 34.3,
        longitude: -119.2,
        slug: 'static-cafe-ventura',
      }],
      slug: 'static-cafe',
    } as PlaceListItem;

    const result = mergeLiveLocationUpdatesIntoPlaces([place, staticPlace], [{
      latitude: 34.2789,
      longitude: -119.2914,
      slug: 'scoops-truck-ventura',
      updated_at: '2026-08-03T17:33:20Z',
      address_line_1: 'Approximate live location near Main Street',
      city_label: 'Ventura',
    }]);

    expect(result[0].locations[0]).toEqual(expect.objectContaining({
      latitude: 34.2789,
      longitude: -119.2914,
      address_line_1: 'Approximate live location near Main Street',
      city_label: 'Ventura',
    }));
    expect(result[1]).toBe(staticPlace);
  });

  it('keeps the newest coordinate when the live endpoint returns duplicate slugs', () => {
    const place = {
      latitude: 34.2,
      longitude: -119.1,
      locations: [{
        latitude: 34.2,
        longitude: -119.1,
        slug: 'scoops-truck-ventura',
      }],
      slug: 'scoops-truck',
    } as PlaceListItem;

    const result = mergeLiveLocationUpdatesIntoPlaces([place], [
      {
        latitude: 34.2789,
        longitude: -119.2914,
        slug: 'scoops-truck-ventura',
        updated_at: '2026-08-03T17:33:20Z',
      },
      {
        latitude: 34.2001,
        longitude: -119.1001,
        slug: 'scoops-truck-ventura',
        updated_at: '2026-08-03T17:23:20Z',
      },
    ]);

    expect(result[0].locations[0]).toEqual(expect.objectContaining({
      latitude: 34.2789,
      longitude: -119.2914,
      live_location_updated_at: '2026-08-03T17:33:20Z',
    }));
  });

  it('preserves the last known mobile coordinates when a live update is missing', () => {
    const place = {
      latitude: 34.2,
      longitude: -119.1,
      locations: [{
        latitude: 34.2,
        longitude: -119.1,
        slug: 'scoops-truck-ventura',
        venue_type: 'mobile',
      }],
      slug: 'scoops-truck',
      venue_type: 'mobile',
    } as PlaceListItem;
    const staticPlace = {
      latitude: 34.3,
      longitude: -119.2,
      locations: [{
        latitude: 34.3,
        longitude: -119.2,
        slug: 'static-cafe-ventura',
        venue_type: 'cafe',
      }],
      slug: 'static-cafe',
      venue_type: 'cafe',
    } as PlaceListItem;

    const result = mergeLiveLocationUpdatesIntoPlaces([place, staticPlace], [], {
      clearMissingLiveLocations: true,
    });

    expect(result[0]).toEqual(expect.objectContaining({
      latitude: 34.2,
      longitude: -119.1,
    }));
    expect(result[0].locations[0]).toEqual(expect.objectContaining({
      latitude: 34.2,
      longitude: -119.1,
    }));
    expect(result[1]).toBe(staticPlace);
  });

  it('does not clear a mobile business when a child location update is present', () => {
    const place = {
      latitude: 34.2,
      longitude: -119.1,
      locations: [{
        latitude: 34.2,
        longitude: -119.1,
        slug: 'scoops-truck-ventura',
        venue_type: 'mobile',
      }],
      slug: 'scoops-truck',
      venue_type: 'mobile',
    } as PlaceListItem;

    const result = mergeLiveLocationUpdatesIntoPlaces([place], [{
      latitude: 34.2789,
      longitude: -119.2914,
      slug: 'scoops-truck-ventura',
      updated_at: '2026-08-03T17:33:20Z',
    }], {
      clearMissingLiveLocations: true,
    });

    expect(result[0]).toEqual(expect.objectContaining({
      latitude: 34.2,
      longitude: -119.1,
    }));
    expect(result[0].locations[0]).toEqual(expect.objectContaining({
      latitude: 34.2789,
      longitude: -119.2914,
    }));
  });

  it('clears a mobile pin when the live endpoint explicitly disables tracking', () => {
    const place = {
      latitude: 34.2789,
      longitude: -119.2914,
      live_location_updated_at: '2026-08-03T17:33:20Z',
      address_line_1: 'Approximate live location near Main Street',
      city_label: 'Ventura',
      locations: [{
        latitude: 34.2789,
        longitude: -119.2914,
        live_location_updated_at: '2026-08-03T17:33:20Z',
        address_line_1: 'Approximate live location near Main Street',
        city_label: 'Ventura',
        slug: 'scoops-truck-ventura',
        venue_type: 'mobile',
      }],
      slug: 'scoops-truck',
      venue_type: 'mobile',
    } as PlaceListItem;

    const result = mergeLiveLocationUpdatesIntoPlaces([place], [{
      latitude: null,
      longitude: null,
      slug: 'scoops-truck-ventura',
      tracking_enabled: false,
      updated_at: null,
    }]);

    expect(result[0].locations[0]).toEqual(expect.objectContaining({
      latitude: null,
      longitude: null,
      live_location_updated_at: null,
      address_line_1: 'Approximate live location',
      city_label: '',
    }));
    expect(result[0]).toEqual(expect.objectContaining({
      latitude: 34.2789,
      longitude: -119.2914,
    }));
  });

  it('clears the parent pin when the parent slug is explicitly disabled', () => {
    const place = {
      latitude: 34.2789,
      longitude: -119.2914,
      live_location_updated_at: '2026-08-03T17:33:20Z',
      address_line_1: 'Approximate live location near Main Street',
      city_label: 'Ventura',
      locations: [{
        latitude: 34.2789,
        longitude: -119.2914,
        live_location_updated_at: '2026-08-03T17:33:20Z',
        address_line_1: 'Approximate live location near Main Street',
        city_label: 'Ventura',
        slug: 'scoops-truck-ventura',
        venue_type: 'mobile',
      }],
      slug: 'scoops-truck',
      venue_type: 'mobile',
    } as PlaceDetail;

    const result = mergeLiveLocationUpdatesIntoPlaceDetail(place, [{
      latitude: null,
      longitude: null,
      slug: 'scoops-truck',
      tracking_enabled: false,
      updated_at: null,
    }]);

    expect(result).toEqual(expect.objectContaining({
      latitude: null,
      longitude: null,
      live_location_updated_at: null,
      address_line_1: 'Approximate live location',
      city_label: '',
    }));
    expect(result?.locations[0]).toEqual(expect.objectContaining({
      latitude: 34.2789,
      longitude: -119.2914,
    }));
  });
});

describe('formatPlaceAddress', () => {
  it('omits empty city placeholders from approximate live addresses', () => {
    expect(formatPlaceAddress({
      address_line_1: 'Approximate live location near Main Street',
      address_line_2: '',
      city_label: '',
      state: 'CA',
      postal_code: '',
    } as PlaceListItem)).toBe('Approximate live location near Main Street, CA');
  });
});

describe('formatLastKnownLocationLabel', () => {
  it('formats recent locations in minutes', () => {
    expect(formatLastKnownLocationLabel(
      '2026-08-03T17:28:20Z',
      'Approximate live location near Main Street, CA',
      Date.parse('2026-08-03T17:33:20Z'),
    )).toBe('Last known location: Approximate live location near Main Street, CA approximately 5 minutes ago');
  });

  it('formats older locations in hours', () => {
    expect(formatLastKnownLocationLabel(
      '2026-08-03T15:33:20Z',
      'Approximate live location near Main Street, CA',
      Date.parse('2026-08-03T17:33:20Z'),
    )).toBe('Last known location: Approximate live location near Main Street, CA approximately 2 hours ago');
  });

  it('ignores invalid timestamps', () => {
    expect(formatLastKnownLocationLabel('not-a-timestamp', 'Approximate live location')).toBeNull();
  });
});

describe('openMapsAddress', () => {
  it('opens the exact live coordinates rendered in the map preview', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    await openMapsAddress({
      name: 'Scoops Truck',
      latitude: 34.2789,
      longitude: -119.2914,
      address_line_1: 'Approximate live location near Main Street',
      address_line_2: '',
      city_label: 'Ventura',
      state: 'CA',
      postal_code: '',
    } as PlaceListItem);

    expect(openUrl).toHaveBeenCalledWith(expect.stringContaining('34.2789,-119.2914'));
    openUrl.mockRestore();
  });
});
