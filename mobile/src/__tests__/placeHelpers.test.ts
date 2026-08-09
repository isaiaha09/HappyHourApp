import { dedupeImageUrls, formatLastKnownLocationLabel, formatPlaceAddress, mergeLiveLocationUpdatesIntoPlaces } from '../placeHelpers';
import type { PlaceListItem } from '../types';

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
    expect(formatLastKnownLocationLabel('2026-08-03T17:28:20Z', Date.parse('2026-08-03T17:33:20Z'))).toBe('Last known location 5 minutes ago');
  });

  it('formats older locations in hours', () => {
    expect(formatLastKnownLocationLabel('2026-08-03T15:33:20Z', Date.parse('2026-08-03T17:33:20Z'))).toBe('Last known location 2 hours ago');
  });

  it('ignores invalid timestamps', () => {
    expect(formatLastKnownLocationLabel('not-a-timestamp', Date.now())).toBeNull();
  });
});
