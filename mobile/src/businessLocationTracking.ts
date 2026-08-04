import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import {
  buildBusinessLocationKey,
  businessLocationReportIntervalMs,
  getFreshestBusinessLocation,
  shouldReportBusinessLocation,
} from './businessLocationReporting';

export const BUSINESS_LOCATION_TASK_NAME = 'diningdealz-business-location-updates';

const trackingSessionStorageKey = 'diningdealz.business-location.session';
const apiBaseUrlStorageKey = 'diningdealz.business-location.api-base-url';
const lastReportedLocationStorageKey = 'diningdealz.business-location.last-rounded-key';
const lastReportedAtStorageKey = 'diningdealz.business-location.last-reported-at';
const trackingConfigVersionStorageKey = 'diningdealz.business-location.config-version';
const trackingConfigVersion = '3';

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

function buildApiUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
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

async function postBusinessLocationUpdate(
  apiBaseUrl: string,
  authToken: string,
  coords: { accuracy?: number | null; latitude: number; longitude: number },
) {
  const response = await fetch(buildApiUrl(apiBaseUrl, '/profiles/business-location/'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Token ${authToken}`,
    },
    body: JSON.stringify({
      accuracy_meters: coords.accuracy ?? null,
      latitude: coords.latitude,
      longitude: coords.longitude,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => '');
    throw new Error(errorPayload || `Business background location update failed with status ${response.status}.`);
  }
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

export async function reserveBusinessLocationReport(latitude: number, longitude: number) {
  const [lastReportedLocationKey, lastReportedAt] = await Promise.all([
    getSecureItem(lastReportedLocationStorageKey),
    getSecureItem(lastReportedAtStorageKey),
  ]);
  const parsedLastReportedAt = lastReportedAt === null ? null : Number(lastReportedAt);
  const previousReportedAt = parsedLastReportedAt !== null && Number.isFinite(parsedLastReportedAt)
    ? parsedLastReportedAt
    : null;
  const now = Date.now();
  if (!shouldReportBusinessLocation({
    latitude,
    longitude,
    lastReportedAt: previousReportedAt,
    lastReportedLocationKey,
    now,
  })) {
    return false;
  }

  await Promise.all([
    setSecureItem(lastReportedLocationStorageKey, buildBusinessLocationKey(latitude, longitude)),
    setSecureItem(lastReportedAtStorageKey, String(now)),
  ]);
  return true;
}

export async function ensureBusinessBackgroundLocationTaskStarted(
  apiBaseUrl: string,
  session: PersistedBusinessTrackingSession,
) {
  if (Platform.OS === 'web') {
    return;
  }

  await persistBusinessTrackingSession(apiBaseUrl, session);

  if (!(await TaskManager.isAvailableAsync())) {
    return;
  }

  if (await Location.hasStartedLocationUpdatesAsync(BUSINESS_LOCATION_TASK_NAME)) {
    const activeConfigVersion = await getSecureItem(trackingConfigVersionStorageKey);
    if (activeConfigVersion === trackingConfigVersion) {
      return;
    }

    await Location.stopLocationUpdatesAsync(BUSINESS_LOCATION_TASK_NAME);
  }

  await Location.startLocationUpdatesAsync(BUSINESS_LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.OtherNavigation,
    deferredUpdatesDistance: 0,
    deferredUpdatesInterval: businessLocationReportIntervalMs,
    distanceInterval: 1,
    foregroundService: {
      killServiceOnDestroy: false,
      notificationBody: 'DiningDealz is keeping your business map pin current for guests.',
      notificationColor: '#080101',
      notificationTitle: 'Business location tracking active',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    timeInterval: businessLocationReportIntervalMs,
  });
  await setSecureItem(trackingConfigVersionStorageKey, trackingConfigVersion);
}

export async function stopBusinessBackgroundLocationTask(options?: { clearPersistedSession?: boolean }) {
  if (Platform.OS !== 'web' && await TaskManager.isAvailableAsync()) {
    const hasStartedLocationUpdates = await Location.hasStartedLocationUpdatesAsync(BUSINESS_LOCATION_TASK_NAME);
    if (hasStartedLocationUpdates) {
      await Location.stopLocationUpdatesAsync(BUSINESS_LOCATION_TASK_NAME);
    }
  }

  if (options?.clearPersistedSession !== false) {
    await clearPersistedBusinessTrackingSession();
    return;
  }

  await clearPersistedBusinessTrackingLastReportedLocation();
}

if (!TaskManager.isTaskDefined(BUSINESS_LOCATION_TASK_NAME)) {
  TaskManager.defineTask(BUSINESS_LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      return;
    }

    const taskData = data as { locations?: Location.LocationObject[] } | undefined;
    const locations = taskData?.locations;
    const latestLocation = getFreshestBusinessLocation(locations ?? []);
    if (!latestLocation) {
      return;
    }

    const [apiBaseUrl, session] = await Promise.all([
      getSecureItem(apiBaseUrlStorageKey),
      loadPersistedBusinessTrackingSession(),
    ]);
    if (!apiBaseUrl || !session?.authToken) {
      return;
    }

    if (AppState.currentState === 'active') {
      return;
    }

    if (!(await reserveBusinessLocationReport(
      latestLocation.coords.latitude,
      latestLocation.coords.longitude,
    ))) {
      return;
    }

    await postBusinessLocationUpdate(apiBaseUrl, session.authToken, {
      accuracy: latestLocation.coords.accuracy ?? null,
      latitude: latestLocation.coords.latitude,
      longitude: latestLocation.coords.longitude,
    });
  });
}