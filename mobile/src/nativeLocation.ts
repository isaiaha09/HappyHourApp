import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export const Accuracy = {
  Balanced: 'balanced',
  BestForNavigation: 'bestForNavigation',
} as const;

export const ActivityType = {
  OtherNavigation: 'otherNavigation',
} as const;

type AuthorizationPayload = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
};

export type LocationObject = {
  coords: {
    accuracy: number | null;
    latitude: number;
    longitude: number;
  };
  timestamp: number;
};

export type LocationSubscription = {
  remove: () => void;
};

type NativeLocationModule = {
  getAuthorizationStatus: () => Promise<AuthorizationPayload>;
  requestForegroundAuthorization: () => Promise<AuthorizationPayload>;
  requestBackgroundAuthorization: () => Promise<AuthorizationPayload>;
  hasServicesEnabled: () => Promise<boolean>;
  getCurrentPosition: () => Promise<LocationObject>;
  startUpdatingLocation: () => Promise<void>;
  stopUpdatingLocation: () => Promise<void>;
};

const nativeLocationModule = NativeModules.DiningDealzLocation as NativeLocationModule | undefined;
const nativeLocationEvents = nativeLocationModule && Platform.OS === 'ios'
  ? new NativeEventEmitter(NativeModules.DiningDealzLocation)
  : null;
let activeWatcherCount = 0;
let backgroundUpdatesRequested = false;

const unsupportedAuthorization: AuthorizationPayload = {
  status: 'denied',
  granted: false,
  canAskAgain: false,
};

function requireNativeLocationModule() {
  if (!nativeLocationModule) {
    throw new Error('Native location services are unavailable in this build.');
  }

  return nativeLocationModule;
}

export async function getForegroundPermissionsAsync() {
  if (!nativeLocationModule) {
    return unsupportedAuthorization;
  }

  return nativeLocationModule.getAuthorizationStatus();
}

export async function requestForegroundPermissionsAsync() {
  if (!nativeLocationModule) {
    return unsupportedAuthorization;
  }

  return nativeLocationModule.requestForegroundAuthorization();
}

export async function getBackgroundPermissionsAsync() {
  if (!nativeLocationModule) {
    return unsupportedAuthorization;
  }

  const authorization = await nativeLocationModule.getAuthorizationStatus();
  return {
    ...authorization,
    granted: authorization.status === 'authorizedAlways',
  };
}

export async function requestBackgroundPermissionsAsync() {
  if (!nativeLocationModule) {
    return unsupportedAuthorization;
  }

  const authorization = await nativeLocationModule.requestBackgroundAuthorization();
  return {
    ...authorization,
    granted: authorization.status === 'authorizedAlways',
  };
}

export async function isBackgroundLocationAvailableAsync() {
  if (!nativeLocationModule) {
    return false;
  }

  return nativeLocationModule.hasServicesEnabled();
}

export async function startNativeLocationUpdates() {
  if (!nativeLocationModule) {
    return;
  }

  backgroundUpdatesRequested = true;
  await nativeLocationModule.startUpdatingLocation();
}

export async function stopNativeLocationUpdates() {
  if (!nativeLocationModule) {
    return;
  }

  backgroundUpdatesRequested = false;
  if (activeWatcherCount === 0) {
    await nativeLocationModule.stopUpdatingLocation();
  }
}

export async function getCurrentPositionAsync(_options?: { accuracy?: string }) {
  return requireNativeLocationModule().getCurrentPosition();
}

export async function watchPositionAsync(
  _options: { accuracy?: string; distanceInterval?: number; timeInterval?: number },
  callback: (location: LocationObject) => void,
): Promise<LocationSubscription> {
  const module = requireNativeLocationModule();
  const subscription = nativeLocationEvents?.addListener('locationUpdate', callback);
  activeWatcherCount += 1;
  await module.startUpdatingLocation();

  let removed = false;
  return {
    remove: () => {
      if (removed) {
        return;
      }

      removed = true;
      subscription?.remove();
      activeWatcherCount = Math.max(0, activeWatcherCount - 1);
      if (activeWatcherCount === 0 && !backgroundUpdatesRequested) {
        void module.stopUpdatingLocation();
      }
    },
  };
}
