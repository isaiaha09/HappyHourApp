import { Linking } from 'react-native';

import type { LiveLocationPlaceUpdate, PlaceDetail, PlaceListItem, PlaceLocation, PlaceLocationDetail } from './types';

export function formatPlaceAddress(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const lineOne = place.address_line_1;
  const lineTwo = place.address_line_2 ? `, ${place.address_line_2}` : '';
  return `${lineOne}${lineTwo}, ${place.city_label}, ${place.state} ${place.postal_code}`;
}

export function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeImageUrlForDedup(imageUrl: string) {
  const trimmedValue = imageUrl.trim();
  if (!trimmedValue) {
    return '';
  }

  const withoutFragment = trimmedValue.replace(/#.*$/, '');
  const [withoutQuery] = withoutFragment.split('?');
  const normalizedUrlMatch = withoutQuery.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  if (!normalizedUrlMatch) {
    return withoutQuery.toLowerCase();
  }

  const normalizedOrigin = normalizedUrlMatch[1].toLowerCase();
  let normalizedPath = normalizedUrlMatch[2] || '/';

  normalizedPath = normalizedPath.replace(/\/cdn-cgi\/image\/[^/]+\//i, '/');
  normalizedPath = normalizedPath.replace(/\/resize=[^/]+\/output=[^/]+\//i, '/');
  normalizedPath = normalizedPath.replace(/(\/)p\/([^/]+)\/\d+x\d+$/i, '$1p/$2');
  normalizedPath = normalizedPath.replace(/\/:\/rs=[^/]+$/i, '');
  normalizedPath = normalizedPath.replace(/[-_](\d{2,4})x(\d{2,4})(?=\.[a-z0-9]+$)/i, '');
  normalizedPath = normalizedPath.replace(/\/(small|medium|large|original)$/i, '');

  return `${normalizedOrigin}${normalizedPath}`;
}

export function dedupeImageUrls(imageUrls: string[]) {
  const dedupedImageUrls: string[] = [];
  const seenKeys = new Set<string>();

  for (const imageUrl of imageUrls) {
    const trimmedValue = imageUrl.trim();
    if (!trimmedValue) {
      continue;
    }

    const dedupeKey = normalizeImageUrlForDedup(trimmedValue);
    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    dedupedImageUrls.push(trimmedValue);
  }

  return dedupedImageUrls;
}

function isDisplayableImageUrl(imageUrl: string) {
  const normalizedValue = imageUrl.trim().toLowerCase();
  if (!normalizedValue) {
    return false;
  }

  if (/\.(mp4|mov|m4v|webm)(?:$|[?#])/.test(normalizedValue)) {
    return false;
  }

  return normalizedValue.startsWith('http://') || normalizedValue.startsWith('https://');
}

export function getPlaceCardImageUrl(place: PlaceListItem) {
  const candidateUrls = dedupeImageUrls([
    ...place.image_urls,
    ...getPlaceLocations(place).flatMap((location) => location.image_urls ?? []),
  ]);

  return candidateUrls.find(isDisplayableImageUrl) ?? null;
}

export function getPlaceLocations(place: PlaceListItem | PlaceDetail) {
  return place.locations.length ? place.locations : [place];
}

const mobileBusinessVenueType = 'mobile';
const multipleAreasBusinessCity = 'multiple_areas';
const liveLocationAddressPrefix = 'approximate live location';

function isLiveLocationPlace(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const normalizedAddress = String(place.address_line_1 ?? '').trim().toLowerCase();
  return place.venue_type === mobileBusinessVenueType
    || place.city === multipleAreasBusinessCity
    || normalizedAddress.startsWith(liveLocationAddressPrefix);
}

export function stripLiveLocationCoordinatesFromPlaces(places: PlaceListItem[]) {
  let changed = false;
  const nextPlaces = places.map((place) => {
    const nextLocations = place.locations.map((location) => {
      if (!isLiveLocationPlace(location) || (location.latitude === null && location.longitude === null)) {
        return location;
      }

      changed = true;
      return {
        ...location,
        latitude: null,
        longitude: null,
      };
    });
    const locationsChanged = nextLocations.some((location, index) => location !== place.locations[index]);

    if (!isLiveLocationPlace(place) || (!locationsChanged && place.latitude === null && place.longitude === null)) {
      if (!locationsChanged) {
        return place;
      }

      changed = true;
      return {
        ...place,
        locations: nextLocations,
      };
    }

    changed = true;
    return {
      ...place,
      latitude: null,
      longitude: null,
      locations: nextLocations,
    };
  });

  return changed ? nextPlaces : places;
}

export function mergeLiveLocationUpdatesIntoPlaces(
  places: PlaceListItem[],
  updates: LiveLocationPlaceUpdate[],
  options: { clearMissingLiveLocations?: boolean } = {},
) {
  if (!places.length) {
    return places;
  }

  const updatesBySlug = new Map(updates.map((update) => [update.slug, update]));
  const shouldClearMissingLiveLocations = !!options.clearMissingLiveLocations;
  let changed = false;
  const nextPlaces = places.map((place) => {
    const nextLocations = place.locations.map((location) => {
      const update = updatesBySlug.get(location.slug);
      if (!update) {
        if (
          shouldClearMissingLiveLocations
          && isLiveLocationPlace(location)
          && (location.latitude !== null || location.longitude !== null)
        ) {
          return {
            ...location,
            latitude: null,
            longitude: null,
          };
        }
        return location;
      }

      if (location.latitude === update.latitude && location.longitude === update.longitude) {
        return location;
      }

      return {
        ...location,
        latitude: update.latitude,
        longitude: update.longitude,
      };
    });
    const locationsChanged = nextLocations.some((location, index) => location !== place.locations[index]);
    const update = updatesBySlug.get(place.slug);
    const hasLocationUpdate = place.locations.some((location) => updatesBySlug.has(location.slug));
    const shouldClearPlaceCoordinates = shouldClearMissingLiveLocations
      && update === undefined
      && !hasLocationUpdate
      && isLiveLocationPlace(place)
      && (place.latitude !== null || place.longitude !== null);
    const placeChanged = shouldClearPlaceCoordinates || (
      update !== undefined && (place.latitude !== update.latitude || place.longitude !== update.longitude)
    );
    if (!locationsChanged && !placeChanged) {
      return place;
    }

    changed = true;
    return {
      ...place,
      ...(update ? {
        latitude: update.latitude,
        longitude: update.longitude,
      } : shouldClearPlaceCoordinates ? {
        latitude: null,
        longitude: null,
      } : {}),
      locations: nextLocations,
    };
  });

  return changed ? nextPlaces : places;
}

export function mergeLiveLocationUpdatesIntoPlaceDetail(
  place: PlaceDetail | null,
  updates: LiveLocationPlaceUpdate[],
  options: { clearMissingLiveLocations?: boolean } = {},
) {
  if (!place) {
    return place;
  }

  const updatesBySlug = new Map(updates.map((update) => [update.slug, update]));
  const shouldClearMissingLiveLocations = !!options.clearMissingLiveLocations;

  const nextLocations = place.locations.map((location) => {
    const update = updatesBySlug.get(location.slug);
    if (!update) {
      if (
        shouldClearMissingLiveLocations
        && isLiveLocationPlace(location)
        && (location.latitude !== null || location.longitude !== null)
      ) {
        return {
          ...location,
          latitude: null,
          longitude: null,
        };
      }
      return location;
    }

    if (location.latitude === update.latitude && location.longitude === update.longitude) {
      return location;
    }

    return {
      ...location,
      latitude: update.latitude,
      longitude: update.longitude,
    };
  });
  const locationsChanged = nextLocations.some((location, index) => location !== place.locations[index]);
  const update = updatesBySlug.get(place.slug);
  const hasLocationUpdate = place.locations.some((location) => updatesBySlug.has(location.slug));
  const shouldClearPlaceCoordinates = shouldClearMissingLiveLocations
    && update === undefined
    && !hasLocationUpdate
    && isLiveLocationPlace(place)
    && (place.latitude !== null || place.longitude !== null);
  const placeChanged = shouldClearPlaceCoordinates || (
    update !== undefined && (place.latitude !== update.latitude || place.longitude !== update.longitude)
  );
  if (!locationsChanged && !placeChanged) {
    return place;
  }

  return {
    ...place,
    ...(update ? {
      latitude: update.latitude,
      longitude: update.longitude,
    } : shouldClearPlaceCoordinates ? {
      latitude: null,
      longitude: null,
    } : {}),
    locations: nextLocations,
  };
}

export function getPlaceCardEyebrow(place: PlaceListItem) {
  const cityLabels = Array.from(new Set(getPlaceLocations(place).map((location) => location.city_label)));
  return cityLabels.join(' • ');
}

export function getPlaceCardAddress(place: PlaceListItem) {
  const locations = getPlaceLocations(place);
  if (locations.length > 1) {
    return `${locations.length} locations`;
  }

  return formatPlaceAddress(locations[0] ?? place);
}

export function getPlacePreviewRegion(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail | null) {
  if (!place || place.latitude === null || place.longitude === null) {
    return null;
  }

  return {
    latitude: place.latitude,
    longitude: place.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };
}

export async function openMapsAddress(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const query = encodeURIComponent(formatPlaceAddress(place));
  await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
}

export function buildGoogleReviewsUrl(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const query = encodeURIComponent(`${place.name} ${formatPlaceAddress(place)}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function getSelectedClaimLocation(place: PlaceListItem | null, locationId: number | null) {
  if (!place) {
    return null;
  }

  const locations = getPlaceLocations(place);
  if (!locations.length) {
    return null;
  }

  if (locationId !== null) {
    const selectedLocation = locations.find((location) => location.id === locationId);
    if (selectedLocation) {
      return selectedLocation;
    }
  }

  return locations[0] ?? null;
}

export function consolidatePlacesBySlug(places: PlaceListItem[]) {
  const consolidatedPlaces = new Map<string, PlaceListItem>();

  places.forEach((place) => {
    const existingPlace = consolidatedPlaces.get(place.slug);
    const nextLocations = dedupePlaceLocations([
      ...getPlaceLocations(existingPlace ?? place),
      ...getPlaceLocations(place),
    ]);

    if (!existingPlace) {
      consolidatedPlaces.set(place.slug, {
        ...place,
        ...nextLocations[0],
        locations: nextLocations,
      });
      return;
    }

    consolidatedPlaces.set(place.slug, {
      ...existingPlace,
      ...nextLocations[0],
      locations: nextLocations,
    });
  });

  return Array.from(consolidatedPlaces.values());
}

function dedupePlaceLocations(locations: PlaceLocation[]) {
  const uniqueLocations = new Map<number, PlaceLocation>();

  locations.forEach((location) => {
    if (!uniqueLocations.has(location.id)) {
      uniqueLocations.set(location.id, location);
    }
  });

  return Array.from(uniqueLocations.values());
}
