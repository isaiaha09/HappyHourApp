export const businessLocationReportIntervalMs = 30_000;

export function buildBusinessLocationKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
}

export function getFreshestBusinessLocation<T extends { timestamp: number }>(locations: T[]) {
  return locations.reduce<T | null>((freshestLocation, location) => (
    !freshestLocation || location.timestamp > freshestLocation.timestamp ? location : freshestLocation
  ), null);
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
