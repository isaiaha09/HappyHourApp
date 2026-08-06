import { dedupeImageUrls, mergeLiveLocationUpdatesIntoPlaces, stripLiveLocationCoordinatesFromPlaces } from '../placeHelpers';
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
    }]);

    expect(result[0].locations[0]).toEqual(expect.objectContaining({
      latitude: 34.2789,
      longitude: -119.2914,
    }));
    expect(result[1]).toBe(staticPlace);
  });

  it('clears stale mobile coordinates when live updates are authoritative and the business is missing', () => {
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
      latitude: null,
      longitude: null,
    }));
    expect(result[0].locations[0]).toEqual(expect.objectContaining({
      latitude: null,
      longitude: null,
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

describe('stripLiveLocationCoordinatesFromPlaces', () => {
  it('removes cached coordinates for live-location businesses while preserving static places', () => {
    const mobilePlace = {
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

    const result = stripLiveLocationCoordinatesFromPlaces([mobilePlace, staticPlace]);

    expect(result[0]).toEqual(expect.objectContaining({
      latitude: null,
      longitude: null,
    }));
    expect(result[0].locations[0]).toEqual(expect.objectContaining({
      latitude: null,
      longitude: null,
    }));
    expect(result[1]).toBe(staticPlace);
  });

  it('removes cached coordinates for service-area businesses identified by approximate live location text', () => {
    const serviceAreaPlace = {
      address_line_1: 'Approximate live location',
      latitude: 34.2,
      longitude: -119.1,
      locations: [{
        address_line_1: 'Approximate live location unavailable',
        latitude: 34.2,
        longitude: -119.1,
        slug: 'coffee-catering-ventura',
        venue_type: 'cafe',
      }],
      slug: 'coffee-catering',
      venue_type: 'cafe',
    } as PlaceListItem;

    const result = stripLiveLocationCoordinatesFromPlaces([serviceAreaPlace]);

    expect(result[0]).toEqual(expect.objectContaining({
      latitude: null,
      longitude: null,
    }));
    expect(result[0].locations[0]).toEqual(expect.objectContaining({
      latitude: null,
      longitude: null,
    }));
  });
});
