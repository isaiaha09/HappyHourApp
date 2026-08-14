import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { startNativeLocationUpdates, stopNativeLocationUpdates } from './nativeLocation';
import {
  buildBusinessLocationKey,
  shouldReportBusinessLocation,
} from './businessLocationReporting';

const trackingSessionStorageKey = 'diningdealz.business-location.session';
const apiBaseUrlStorageKey = 'diningdealz.business-location.api-base-url';
const lastReportedLocationStorageKey = 'diningdealz.business-location.last-rounded-key';
const lastReportedAtStorageKey = 'diningdealz.business-location.last-reported-at';
const trackingConfigVersionStorageKey = 'diningdealz.business-location.config-version';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export type PersistedBusinessTrackingSession = {
  approvedBusinessSlugs: string[];
  authToken: string;
};

function normalizeApiBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

async function getSecureItem(key: string) {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return null;
  }

  return SecureStore.getItemAsync(key, secureStoreOptions);
}

async function setSecureItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    return;
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.setItemAsync(key, value, secureStoreOptions);
}

async function deleteSecureItem(key: string) {
  if (Platform.OS === 'web') {
    return;
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.deleteItemAsync(key, secureStoreOptions);
}

export async function loadPersistedBusinessTrackingSession() {
  const rawValue = await getSecureItem(trackingSessionStorageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PersistedBusinessTrackingSession;
    if (!parsedValue?.authToken || !Array.isArray(parsedValue.approvedBusinessSlugs)) {
      throw new Error('Invalid business tracking session payload.');
    }

    return parsedValue;
  } catch {
    await clearPersistedBusinessTrackingSession();
    return null;
  }
}

export async function persistBusinessTrackingSession(
  apiBaseUrl: string,
  session: PersistedBusinessTrackingSession,
) {
  await setSecureItem(trackingSessionStorageKey, JSON.stringify(session));
  await setSecureItem(apiBaseUrlStorageKey, normalizeApiBaseUrl(apiBaseUrl));
}

export async function clearPersistedBusinessTrackingSession() {
  await Promise.all([
    deleteSecureItem(trackingSessionStorageKey),
    deleteSecureItem(apiBaseUrlStorageKey),
    deleteSecureItem(lastReportedLocationStorageKey),
    deleteSecureItem(lastReportedAtStorageKey),
    deleteSecureItem(trackingConfigVersionStorageKey),
  ]);
}

export async function clearPersistedBusinessTrackingLastReportedLocation() {
  await Promise.all([
    deleteSecureItem(lastReportedLocationStorageKey),
    deleteSecureItem(lastReportedAtStorageKey),
  ]);
}

export async function reserveBusinessLocationReport(
  latitude: number,
  longitude: number,
  options: { force?: boolean } = {},
) {
  const [lastReportedLocationKey, lastReportedAt] = await Promise.all([
    getSecureItem(lastReportedLocationStorageKey),
    getSecureItem(lastReportedAtStorageKey),
  ]);
  const parsedLastReportedAt = lastReportedAt === null ? null : Number(lastReportedAt);
  const previousReportedAt = parsedLastReportedAt !== null && Number.isFinite(parsedLastReportedAt)
    ? parsedLastReportedAt
    : null;
  const now = Date.now();
  if (!options.force && !shouldReportBusinessLocation({
    latitude,
    longitude,
    lastReportedAt: previousReportedAt,
    lastReportedLocationKey,
    now,
  })) {
    return false;
  }

  return true;
}

export async function commitBusinessLocationReport(latitude: number, longitude: number, reportedAt = Date.now()) {
  await Promise.all([
    setSecureItem(lastReportedLocationStorageKey, buildBusinessLocationKey(latitude, longitude)),
    setSecureItem(lastReportedAtStorageKey, String(reportedAt)),
  ]);
}

export async function ensureBusinessBackgroundLocationTaskStarted(
  apiBaseUrl: string,
  session: PersistedBusinessTrackingSession,
) {
  if (Platform.OS === 'web') {
    return;
  }

  await persistBusinessTrackingSession(apiBaseUrl, session);
  await startNativeLocationUpdates();
}

export async function stopBusinessBackgroundLocationTask(options?: { clearPersistedSession?: boolean }) {
  if (Platform.OS !== 'web') {
    await stopNativeLocationUpdates();
  }

  if (options?.clearPersistedSession !== false) {
    await clearPersistedBusinessTrackingSession();
    return;
  }

  await clearPersistedBusinessTrackingLastReportedLocation();
}
