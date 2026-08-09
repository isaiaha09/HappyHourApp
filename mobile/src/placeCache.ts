import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

import type { PlaceListItem } from './types';

const placeCacheFileName = 'diningdealz-place-cache.json';

type PersistedPlaceCache = {
  apiBaseUrl: string;
  places: PlaceListItem[];
};

function getPlaceCacheFile() {
  return new File(Paths.document, placeCacheFileName);
}

export async function loadPersistedPlaceCache(apiBaseUrl: string) {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const cacheFile = getPlaceCacheFile();
    if (!cacheFile.exists) {
      return null;
    }

    const parsedCache = JSON.parse(await cacheFile.text()) as PersistedPlaceCache;
    if (
      !parsedCache
      || parsedCache.apiBaseUrl !== apiBaseUrl
      || !Array.isArray(parsedCache.places)
    ) {
      return null;
    }

    return parsedCache.places;
  } catch {
    return null;
  }
}

let pendingPlaceCacheWrite: Promise<void> = Promise.resolve();

export function persistPlaceCache(apiBaseUrl: string, places: PlaceListItem[]) {
  if (Platform.OS === 'web') {
    return Promise.resolve();
  }

  pendingPlaceCacheWrite = pendingPlaceCacheWrite.then(() => {
    try {
      const cacheFile = getPlaceCacheFile();
      if (!cacheFile.exists) {
        cacheFile.create({ intermediates: true });
      }
      cacheFile.write(JSON.stringify({ apiBaseUrl, places } satisfies PersistedPlaceCache));
    } catch {
      // A filesystem cache is best effort; in-memory map data remains authoritative.
    }
  });

  return pendingPlaceCacheWrite;
}

export function clearPersistedPlaceCache() {
  if (Platform.OS === 'web') {
    return Promise.resolve();
  }

  pendingPlaceCacheWrite = pendingPlaceCacheWrite.then(() => {
    try {
      const cacheFile = getPlaceCacheFile();
      if (cacheFile.exists) {
        cacheFile.delete();
      }
    } catch {
    }
  });

  return pendingPlaceCacheWrite;
}
