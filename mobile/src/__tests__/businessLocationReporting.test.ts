import {
  buildBusinessLocationKey,
  businessLocationReportIntervalMs,
  getFreshestBusinessLocation,
  shouldReportBusinessLocation,
} from '../businessLocationReporting';

const latitude = 34.2171;
const longitude = -119.0385;
const now = 1_000_000;

describe('shouldReportBusinessLocation', () => {
  it('allows the first location immediately', () => {
    expect(shouldReportBusinessLocation({
      latitude,
      longitude,
      lastReportedAt: null,
      lastReportedLocationKey: null,
      now,
    })).toBe(true);
  });

  it('allows a stationary heartbeat after the reporting interval', () => {
    expect(shouldReportBusinessLocation({
      latitude,
      longitude,
      lastReportedAt: now - businessLocationReportIntervalMs,
      lastReportedLocationKey: buildBusinessLocationKey(latitude, longitude),
      now,
    })).toBe(true);
  });

  it('rejects movement before the reporting interval elapses', () => {
    expect(shouldReportBusinessLocation({
      latitude: latitude + 0.001,
      longitude,
      lastReportedAt: now - businessLocationReportIntervalMs + 1,
      lastReportedLocationKey: buildBusinessLocationKey(latitude, longitude),
      now,
    })).toBe(false);
  });

  it('allows the latest moved location after the reporting interval', () => {
    expect(shouldReportBusinessLocation({
      latitude: latitude + 0.001,
      longitude,
      lastReportedAt: now - businessLocationReportIntervalMs,
      lastReportedLocationKey: buildBusinessLocationKey(latitude, longitude),
      now,
    })).toBe(true);
  });

  it('preserves final movement smaller than the old 11-meter rounding threshold', () => {
    expect(shouldReportBusinessLocation({
      latitude: latitude + 0.00002,
      longitude,
      lastReportedAt: now - businessLocationReportIntervalMs,
      lastReportedLocationKey: buildBusinessLocationKey(latitude, longitude),
      now,
    })).toBe(true);
  });
});

describe('getFreshestBusinessLocation', () => {
  it('selects the newest timestamp even when a native batch is unordered', () => {
    const freshestLocation = getFreshestBusinessLocation([
      { id: 'middle', timestamp: 200 },
      { id: 'newest', timestamp: 300 },
      { id: 'oldest', timestamp: 100 },
    ]);

    expect(freshestLocation?.id).toBe('newest');
  });
});
