const mockSecureStoreValues = new Map<string, string>();
const mockFetch = jest.fn();
type MockTaskHandler = (event: { data?: unknown; error?: unknown }) => Promise<void>;

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

jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  ActivityType: { OtherNavigation: 2 },
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isAvailableAsync: jest.fn(async () => true),
  isTaskDefined: jest.fn(() => false),
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
  persistBusinessTrackingSession,
  reserveBusinessLocationReport,
} from '../businessLocationTracking';

const taskManagerMock = jest.requireMock('expo-task-manager') as {
  defineTask: jest.Mock;
  isTaskDefined: jest.Mock;
};

const trackedLocation = {
  coords: {
    accuracy: 4,
    latitude: 34.2789,
    longitude: -119.2914,
  },
  timestamp: 1,
};

function runBackgroundLocationTask() {
  const registeredTask = taskManagerMock.defineTask.mock.calls.at(-1)?.[1] as MockTaskHandler | undefined;
  if (!registeredTask) {
    throw new Error('The business location task was not registered.');
  }

  return registeredTask({
    data: { locations: [trackedLocation] },
    error: null,
  });
}

describe('business location tracking delivery', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    mockSecureStoreValues.clear();
    mockFetch.mockReset();
    originalFetch = global.fetch;
    global.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retries the same stationary coordinate after a background upload fails', async () => {
    expect(taskManagerMock.defineTask).toHaveBeenCalled();
    await persistBusinessTrackingSession('http://127.0.0.1:8000/api', {
      approvedBusinessSlugs: ['scoops-truck-ventura'],
      authToken: 'token-123',
    });
    mockFetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true } as Response);

    await runBackgroundLocationTask();
    await runBackgroundLocationTask();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(await reserveBusinessLocationReport(trackedLocation.coords.latitude, trackedLocation.coords.longitude)).toBe(false);
  });

  it('allows a reconnect retry for a coordinate already reported successfully', async () => {
    await commitBusinessLocationReport(trackedLocation.coords.latitude, trackedLocation.coords.longitude, Date.now());

    expect(await reserveBusinessLocationReport(trackedLocation.coords.latitude, trackedLocation.coords.longitude)).toBe(false);
    expect(await reserveBusinessLocationReport(
      trackedLocation.coords.latitude,
      trackedLocation.coords.longitude,
      { force: true },
    )).toBe(true);
  });

  it('re-registers the task before starting background location updates', async () => {
    taskManagerMock.defineTask.mockClear();

    await ensureBusinessBackgroundLocationTaskStarted('http://127.0.0.1:8000/api', {
      approvedBusinessSlugs: ['scoops-truck-ventura'],
      authToken: 'token-123',
    });

    expect(taskManagerMock.defineTask).toHaveBeenCalledTimes(1);
  });
});
