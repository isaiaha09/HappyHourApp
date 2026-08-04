import {
  buildBusinessLocationKey,
  businessLocationReportIntervalMs,
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

  it('rejects the same rounded location', () => {
    expect(shouldReportBusinessLocation({
      latitude,
      longitude,
      lastReportedAt: now - businessLocationReportIntervalMs,
      lastReportedLocationKey: buildBusinessLocationKey(latitude, longitude),
      now,
    })).toBe(false);
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
});
