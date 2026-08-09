import { Linking, Platform } from 'react-native';

import type { LiveLocationPlaceUpdate, PlaceDetail, PlaceListItem, PlaceLocation, PlaceLocationDetail } from './types';

export function formatPlaceAddress(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const addressParts = [
    place.address_line_1,
    place.address_line_2,
    place.city_label,
    [place.state, place.postal_code].filter(Boolean).join(' '),
  ].filter((part) => part && part !== '-');
  return addressParts.join(', ');
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

function getClearedLiveAddressFields(place: { address_line_1: string; city_label: string }) {
  if (!place.address_line_1.startsWith('Approximate live location')) {
    return {} as { address_line_1?: string; city_label?: string };
  }

  return {
    address_line_1: 'Approximate live location',
    city_label: '',
  };
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

export function formatLastKnownLocationLabel(
  updatedAt: string | null | undefined,
  address: string,
  now = Date.now(),
) {
  if (!updatedAt) {
    return null;
  }

  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return null;
  }

  const elapsedMinutes = Math.max(1, Math.floor(Math.max(0, now - updatedAtMs) / 60_000));
  if (elapsedMinutes < 60) {
    const minuteLabel = elapsedMinutes === 1 ? 'minute' : 'minutes';
    return `Last known location: ${address} approximately ${elapsedMinutes} ${minuteLabel} ago`;
  }

  const elapsedHours = Math.max(1, Math.floor(elapsedMinutes / 60));
  const hourLabel = elapsedHours === 1 ? 'hour' : 'hours';
  return `Last known location: ${address} approximately ${elapsedHours} ${hourLabel} ago`;
}

function getLiveLocationUpdateTimestamp(update: LiveLocationPlaceUpdate) {
  if (!update.updated_at) {
    return null;
  }

  const timestamp = Date.parse(update.updated_at);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getLatestLiveLocationUpdatesBySlug(updates: LiveLocationPlaceUpdate[]) {
  const updatesBySlug = new Map<string, LiveLocationPlaceUpdate>();
  for (const update of updates) {
    const existingUpdate = updatesBySlug.get(update.slug);
    if (!existingUpdate) {
      updatesBySlug.set(update.slug, update);
      continue;
    }

    const existingTimestamp = getLiveLocationUpdateTimestamp(existingUpdate);
    const updateTimestamp = getLiveLocationUpdateTimestamp(update);
    if (existingTimestamp === null && updateTimestamp !== null) {
      updatesBySlug.set(update.slug, update);
      continue;
    }

    if (existingTimestamp !== null && updateTimestamp !== null && updateTimestamp > existingTimestamp) {
      updatesBySlug.set(update.slug, update);
    }
  }

  return updatesBySlug;
}

export function mergeLiveLocationUpdatesIntoPlaces(
  places: PlaceListItem[],
  updates: LiveLocationPlaceUpdate[],
  _options: { clearMissingLiveLocations?: boolean } = {},
) {
  if (!places.length) {
    return places;
  }

  const updatesBySlug = getLatestLiveLocationUpdatesBySlug(updates);
  let changed = false;
  const nextPlaces = places.map((place) => {
    const nextLocations = place.locations.map((location) => {
      const update = updatesBySlug.get(location.slug);
      if (!update || ((update.latitude === null || update.longitude === null) && update.tracking_enabled !== false)) {
        return location;
      }

      if (update.tracking_enabled === false) {
        const clearedAddressFields = getClearedLiveAddressFields(location);
        const nextAddressLine1 = clearedAddressFields.address_line_1 ?? location.address_line_1;
        const nextCityLabel = clearedAddressFields.city_label ?? location.city_label;
        if (
          location.latitude === null
          && location.longitude === null
          && location.live_location_updated_at === null
          && location.address_line_1 === nextAddressLine1
          && location.city_label === nextCityLabel
        ) {
          return location;
        }

        return {
          ...location,
          latitude: null,
          longitude: null,
          live_location_updated_at: null,
          address_line_1: nextAddressLine1,
          city_label: nextCityLabel,
        };
      }

      const nextUpdatedAt = update.updated_at ?? location.live_location_updated_at ?? null;
      const hasAddressUpdate = update.address_line_1 !== undefined && update.address_line_1 !== null
        || update.city_label !== undefined && update.city_label !== null;
      const nextAddressLine1 = update.address_line_1 ?? location.address_line_1;
      const nextCityLabel = update.city_label ?? location.city_label;
      if (
        location.latitude === update.latitude
        && location.longitude === update.longitude
        && location.live_location_updated_at === nextUpdatedAt
        && location.address_line_1 === nextAddressLine1
        && location.city_label === nextCityLabel
      ) {
        return location;
      }

      return {
        ...location,
        latitude: update.latitude,
        longitude: update.longitude,
        live_location_updated_at: nextUpdatedAt,
        ...(hasAddressUpdate ? {
          address_line_1: nextAddressLine1,
          city_label: nextCityLabel,
        } : {}),
      };
    });
    const locationsChanged = nextLocations.some((location, index) => location !== place.locations[index]);
    const update = updatesBySlug.get(place.slug);
    const isPlaceTrackingDisabled = update?.tracking_enabled === false;
    const hasCompletePlaceUpdate = update !== undefined && update.latitude !== null && update.longitude !== null;
    const nextPlaceUpdatedAt = hasCompletePlaceUpdate
      ? update.updated_at ?? place.live_location_updated_at ?? null
      : place.live_location_updated_at ?? null;
    const hasPlaceAddressUpdate = hasCompletePlaceUpdate && (
      update.address_line_1 !== undefined && update.address_line_1 !== null
      || update.city_label !== undefined && update.city_label !== null
    );
    const nextPlaceAddressLine1 = update?.address_line_1 ?? place.address_line_1;
    const nextPlaceCityLabel = update?.city_label ?? place.city_label;
    const clearedPlaceAddressFields = isPlaceTrackingDisabled ? getClearedLiveAddressFields(place) : {};
    const clearedPlaceAddressLine1 = clearedPlaceAddressFields.address_line_1 ?? place.address_line_1;
    const clearedPlaceCityLabel = clearedPlaceAddressFields.city_label ?? place.city_label;
    const placeChanged = isPlaceTrackingDisabled
      ? place.latitude !== null
        || place.longitude !== null
        || place.live_location_updated_at !== null
        || place.address_line_1 !== clearedPlaceAddressLine1
        || place.city_label !== clearedPlaceCityLabel
      : hasCompletePlaceUpdate && (
        place.latitude !== update.latitude
        || place.longitude !== update.longitude
        || place.live_location_updated_at !== nextPlaceUpdatedAt
        || (hasPlaceAddressUpdate && place.address_line_1 !== nextPlaceAddressLine1)
        || (hasPlaceAddressUpdate && place.city_label !== nextPlaceCityLabel)
      );
    if (!locationsChanged && !placeChanged) {
      return place;
    }

    changed = true;
    return {
      ...place,
      ...(isPlaceTrackingDisabled ? {
        latitude: null,
        longitude: null,
        live_location_updated_at: null,
        address_line_1: clearedPlaceAddressLine1,
        city_label: clearedPlaceCityLabel,
      } : hasCompletePlaceUpdate ? {
        latitude: update.latitude,
        longitude: update.longitude,
        live_location_updated_at: nextPlaceUpdatedAt,
        ...(hasPlaceAddressUpdate ? {
          address_line_1: nextPlaceAddressLine1,
          city_label: nextPlaceCityLabel,
        } : {}),
      } : {}),
      locations: nextLocations,
    };
  });

  return changed ? nextPlaces : places;
}

export function mergeLiveLocationUpdatesIntoPlaceDetail(
  place: PlaceDetail | null,
  updates: LiveLocationPlaceUpdate[],
  _options: { clearMissingLiveLocations?: boolean } = {},
) {
  if (!place) {
    return place;
  }

  const updatesBySlug = getLatestLiveLocationUpdatesBySlug(updates);
  const nextLocations = place.locations.map((location) => {
    const update = updatesBySlug.get(location.slug);
    if (!update || ((update.latitude === null || update.longitude === null) && update.tracking_enabled !== false)) {
      return location;
    }

    if (update.tracking_enabled === false) {
      const clearedAddressFields = getClearedLiveAddressFields(location);
      const nextAddressLine1 = clearedAddressFields.address_line_1 ?? location.address_line_1;
      const nextCityLabel = clearedAddressFields.city_label ?? location.city_label;
      if (
        location.latitude === null
        && location.longitude === null
        && location.live_location_updated_at === null
        && location.address_line_1 === nextAddressLine1
        && location.city_label === nextCityLabel
      ) {
        return location;
      }

      return {
        ...location,
        latitude: null,
        longitude: null,
        live_location_updated_at: null,
        address_line_1: nextAddressLine1,
        city_label: nextCityLabel,
      };
    }

    const nextUpdatedAt = update.updated_at ?? location.live_location_updated_at ?? null;
    const hasAddressUpdate = update.address_line_1 !== undefined && update.address_line_1 !== null
      || update.city_label !== undefined && update.city_label !== null;
    const nextAddressLine1 = update.address_line_1 ?? location.address_line_1;
    const nextCityLabel = update.city_label ?? location.city_label;
    if (
      location.latitude === update.latitude
      && location.longitude === update.longitude
      && location.live_location_updated_at === nextUpdatedAt
      && location.address_line_1 === nextAddressLine1
      && location.city_label === nextCityLabel
    ) {
      return location;
    }

    return {
      ...location,
      latitude: update.latitude,
      longitude: update.longitude,
      live_location_updated_at: nextUpdatedAt,
      ...(hasAddressUpdate ? {
        address_line_1: nextAddressLine1,
        city_label: nextCityLabel,
      } : {}),
    };
  });
  const locationsChanged = nextLocations.some((location, index) => location !== place.locations[index]);
  const update = updatesBySlug.get(place.slug);
  const isPlaceTrackingDisabled = update?.tracking_enabled === false;
  const hasCompletePlaceUpdate = update !== undefined && update.latitude !== null && update.longitude !== null;
  const nextPlaceUpdatedAt = hasCompletePlaceUpdate
    ? update.updated_at ?? place.live_location_updated_at ?? null
    : place.live_location_updated_at ?? null;
  const hasPlaceAddressUpdate = hasCompletePlaceUpdate && (
    update.address_line_1 !== undefined && update.address_line_1 !== null
    || update.city_label !== undefined && update.city_label !== null
  );
  const nextPlaceAddressLine1 = update?.address_line_1 ?? place.address_line_1;
  const nextPlaceCityLabel = update?.city_label ?? place.city_label;
  const clearedPlaceAddressFields = isPlaceTrackingDisabled ? getClearedLiveAddressFields(place) : {};
  const clearedPlaceAddressLine1 = clearedPlaceAddressFields.address_line_1 ?? place.address_line_1;
  const clearedPlaceCityLabel = clearedPlaceAddressFields.city_label ?? place.city_label;
  const placeChanged = isPlaceTrackingDisabled
    ? place.latitude !== null
      || place.longitude !== null
      || place.live_location_updated_at !== null
      || place.address_line_1 !== clearedPlaceAddressLine1
      || place.city_label !== clearedPlaceCityLabel
    : hasCompletePlaceUpdate && (
      place.latitude !== update.latitude
      || place.longitude !== update.longitude
      || place.live_location_updated_at !== nextPlaceUpdatedAt
      || (hasPlaceAddressUpdate && place.address_line_1 !== nextPlaceAddressLine1)
      || (hasPlaceAddressUpdate && place.city_label !== nextPlaceCityLabel)
    );
  if (!locationsChanged && !placeChanged) {
    return place;
  }

  return {
    ...place,
    ...(isPlaceTrackingDisabled ? {
      latitude: null,
      longitude: null,
      live_location_updated_at: null,
      address_line_1: clearedPlaceAddressLine1,
      city_label: clearedPlaceCityLabel,
    } : hasCompletePlaceUpdate ? {
      latitude: update.latitude,
      longitude: update.longitude,
      live_location_updated_at: nextPlaceUpdatedAt,
      ...(hasPlaceAddressUpdate ? {
        address_line_1: nextPlaceAddressLine1,
        city_label: nextPlaceCityLabel,
      } : {}),
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
  if (place.latitude !== null && place.longitude !== null) {
    const coordinateQuery = `${place.latitude},${place.longitude}`;
    const encodedLabel = encodeURIComponent(place.name);
    if (Platform.OS === 'ios') {
      await Linking.openURL(`http://maps.apple.com/?ll=${coordinateQuery}&q=${encodedLabel}`);
      return;
    }

    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${coordinateQuery}`);
    return;
  }

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
