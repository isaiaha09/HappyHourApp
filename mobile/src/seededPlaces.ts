import { getPlaceLocations } from './placeHelpers';
import type { PlaceDetail, PlaceListItem, PlaceLocation, PlaceLocationDetail } from './types';

let cachedSeedPlaces: PlaceListItem[] | null = null;

function loadSeedPlaces() {
  if (cachedSeedPlaces !== null) {
    return cachedSeedPlaces;
  }

  try {
    const maybeSeed = require('../assets/seeds/places.json') as unknown;
    cachedSeedPlaces = Array.isArray(maybeSeed) ? (maybeSeed as PlaceListItem[]) : [];
  } catch {
    // Keep startup resilient if the bundled seed file fails to resolve in a build.
    cachedSeedPlaces = [];
  }

  return cachedSeedPlaces;
}

export function seededPlacesAvailable() {
  const seedPlaces = loadSeedPlaces();
  return seedPlaces.length > 0;
}

export function getSeededPlaces(city: string, hasDeals?: boolean) {
  const seedPlaces = loadSeedPlaces();
  if (!seedPlaces.length) {
    return [];
  }

  return seedPlaces.filter((place) => {
    if (city !== 'all' && place.city !== city) {
      return false;
    }

    if (typeof hasDeals === 'boolean' && place.has_deals !== hasDeals) {
      return false;
    }

    return true;
  });
}

export function getSeededPlaceDetail(slug: string): PlaceDetail | null {
  const seedPlaces = loadSeedPlaces();
  const place = seedPlaces.find((item) => item.slug === slug);
  if (!place) {
    return null;
  }

  const detailLocations: PlaceLocationDetail[] = getPlaceLocations(place).map((location) => toDetailLocation(location));

  return {
    ...place,
    deals: [],
    locations: detailLocations,
  };
}

function toDetailLocation(location: PlaceLocation): PlaceLocationDetail {
  return {
    ...location,
    deals: [],
  };
}
