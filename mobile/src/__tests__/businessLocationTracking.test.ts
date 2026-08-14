const mockSecureStoreValues = new Map<string, string>();
const mockStartNativeLocationUpdates = jest.fn(async () => undefined);
const mockStopNativeLocationUpdates = jest.fn(async () => undefined);

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock',
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreValues.delete(key);
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStoreValues.get(key) ?? null),
  isAvailableAsync: jest.fn(async () => true),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreValues.set(key, value);
  }),
}));

jest.mock('../nativeLocation', () => ({
  startNativeLocationUpdates: () => mockStartNativeLocationUpdates(),
  stopNativeLocationUpdates: () => mockStopNativeLocationUpdates(),
}));

jest.mock('react-native', () => {
  return {
    AppState: { currentState: 'background' },
    Platform: { OS: 'ios' },
  };
});

import {
  commitBusinessLocationReport,
  ensureBusinessBackgroundLocationTaskStarted,
  loadPersistedBusinessTrackingSession,
  persistBusinessTrackingSession,
  reserveBusinessLocationReport,
  stopBusinessBackgroundLocationTask,
} from '../businessLocationTracking';

describe('business location tracking delivery', () => {
  beforeEach(() => {
    mockSecureStoreValues.clear();
    mockStartNativeLocationUpdates.mockClear();
    mockStopNativeLocationUpdates.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts native location updates and persists the business tracking session', async () => {
    await persistBusinessTrackingSession('http://127.0.0.1:8000/api', {
      approvedBusinessSlugs: ['scoops-truck-ventura'],
      authToken: 'token-123',
    });

    await ensureBusinessBackgroundLocationTaskStarted('http://127.0.0.1:8000/api', {
      approvedBusinessSlugs: ['scoops-truck-ventura'],
      authToken: 'token-123',
    });

    expect(mockStartNativeLocationUpdates).toHaveBeenCalledTimes(1);
    await expect(loadPersistedBusinessTrackingSession()).resolves.toEqual({
      approvedBusinessSlugs: ['scoops-truck-ventura'],
      authToken: 'token-123',
    });
  });

  it('allows a reconnect retry for a coordinate already reported successfully', async () => {
    await commitBusinessLocationReport(34.2789, -119.2914, Date.now());

    expect(await reserveBusinessLocationReport(34.2789, -119.2914)).toBe(false);
    expect(await reserveBusinessLocationReport(
      34.2789,
      -119.2914,
      { force: true },
    )).toBe(true);
  });

  it('stops native location updates before clearing persisted tracking state', async () => {
    await stopBusinessBackgroundLocationTask();

    expect(mockStopNativeLocationUpdates).toHaveBeenCalledTimes(1);
  });
});
