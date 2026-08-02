import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const androidNotificationChannelId = 'business-updates';
const iosBundleIdentifier = 'com.ia09.diningdealz';

export type PushRegistrationResult = {
  installationId: string;
  pushToken: string;
  platform: 'ios' | 'android';
};

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(androidNotificationChannelId, {
      name: 'Business updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const currentPermission = await Notifications.getPermissionsAsync();
  const permission = currentPermission.granted
    ? currentPermission
    : currentPermission.canAskAgain
      ? await Notifications.requestPermissionsAsync()
      : currentPermission;

  if (!permission.granted) {
    return null;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    return null;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({
    applicationId: getPushApplicationId(),
    projectId,
  });
  return {
    installationId: await getPushInstallationId(),
    pushToken: tokenResponse.data,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

export function extractFavoriteBusinessSlugFromNotificationData(data: unknown) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const slug = (data as Record<string, unknown>).slug;
  return typeof slug === 'string' && slug.trim().length ? slug.trim() : null;
}

export function extractDirectMessageThreadIdFromNotificationData(data: unknown) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const rawThreadId = (data as Record<string, unknown>).thread_id;
  const parsedThreadId = typeof rawThreadId === 'number'
    ? rawThreadId
    : Number.parseInt(String(rawThreadId ?? ''), 10);
  if (Number.isNaN(parsedThreadId) || parsedThreadId <= 0) {
    return null;
  }

  return parsedThreadId;
}

async function getPushInstallationId() {
  const installationIdFile = getInstallationIdFile();

  // Test/runtime fallback when document storage is unavailable.
  if (!installationIdFile) {
    return createInstallationId();
  }

  try {
    if (installationIdFile.exists) {
      const existingValue = installationIdFile.textSync().trim();
      if (existingValue) {
        return existingValue;
      }
    }
  } catch {
    // Fall through to generate a new installation id.
  }

  const nextValue = createInstallationId();
  try {
    installationIdFile.write(nextValue);
  } catch {
    // Best-effort persistence only.
  }
  return nextValue;
}

function getInstallationIdFile() {
  try {
    if (!Paths.document) {
      return null;
    }

    return new File(Paths.document, 'push-installation-id.txt');
  } catch {
    return null;
  }
}

function getExpoProjectId() {
  return process.env.EXPO_PUBLIC_EXPO_PROJECT_ID
    || Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId
    || '';
}

function getPushApplicationId() {
  if (Platform.OS !== 'ios') {
    return Application.applicationId || undefined;
  }

  if (Application.applicationId === 'host.exp.exponent') {
    throw new Error('Expo Go cannot register push notifications for the DiningDealz standalone app.');
  }

  return iosBundleIdentifier;
}

function createInstallationId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `install-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}