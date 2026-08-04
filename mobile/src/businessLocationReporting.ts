export const businessLocationReportIntervalMs = 30_000;

export function buildBusinessLocationKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
}

export function shouldReportBusinessLocation(input: {
  latitude: number;
  longitude: number;
  lastReportedAt: number | null;
  lastReportedLocationKey: string | null;
  now: number;
}) {
  const locationKey = buildBusinessLocationKey(input.latitude, input.longitude);
  if (locationKey === input.lastReportedLocationKey) {
    return false;
  }

  return input.lastReportedAt === null
    || input.now - input.lastReportedAt >= businessLocationReportIntervalMs;
}
