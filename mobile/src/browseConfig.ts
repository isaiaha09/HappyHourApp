export const cityFilters = [
  { label: 'All 805', value: 'all' },
  { label: 'Ventura', value: 'ventura' },
  { label: 'Oxnard', value: 'oxnard' },
  { label: 'Camarillo', value: 'camarillo' },
] as const;

export type CityFilterValue = (typeof cityFilters)[number]['value'];

export const venueFilters = [
  { label: 'Restaurant', value: 'restaurant' },
  { label: 'Bar', value: 'bar' },
  { label: 'Fast Food', value: 'fast_food' },
  { label: 'Service-Area Business', value: 'mobile' },
  { label: 'Cafe', value: 'cafe' },
  { label: 'Shop', value: 'shop' },
  { label: 'Attraction', value: 'attraction' },
  { label: 'Other', value: 'other' },
] as const;

export const weekdayFilters = [
  { label: 'Sunday', shortLabel: 'Sun', value: 6 },
  { label: 'Monday', shortLabel: 'Mon', value: 0 },
  { label: 'Tuesday', shortLabel: 'Tue', value: 1 },
  { label: 'Wednesday', shortLabel: 'Wed', value: 2 },
  { label: 'Thursday', shortLabel: 'Thu', value: 3 },
  { label: 'Friday', shortLabel: 'Fri', value: 4 },
  { label: 'Saturday', shortLabel: 'Sat', value: 5 },
] as const;

export type BrowseMode = 'list' | 'map';
export type VenueFilterValue = (typeof venueFilters)[number]['value'];
export type WeekdayFilterValue = (typeof weekdayFilters)[number]['value'];

export const multipleAreasBusinessCityOption = { label: 'Serves Multiple Locations / Service Area Business', value: 'multiple_areas' } as const;
export const manualBusinessCityOptions = [...cityFilters.filter((filter) => filter.value !== 'all'), multipleAreasBusinessCityOption] as const;
export const manualBusinessVenueOptions = venueFilters;

const venueMarkerStyles = {
  restaurant: { badge: '🍽️', fill: '#ff7b54', stroke: '#c94d2d' },
  bar: { badge: '🍸', fill: '#ff5c8a', stroke: '#b6315a' },
  fast_food: { badge: '🍔', fill: '#ff6647', stroke: '#b93a23' },
  mobile: { badge: '🚚', fill: '#ffb238', stroke: '#c27a10' },
  cafe: { badge: '☕', fill: '#ff944d', stroke: '#c1611f' },
  shop: { badge: '🛍️', fill: '#ff78b2', stroke: '#ba4a80' },
  attraction: { badge: '🎉', fill: '#9b6dff', stroke: '#6540b5' },
  other: { badge: '📍', fill: '#ff8f70', stroke: '#c46247' },
} as const;

export function getVenueMarkerStyle(venueType: string) {
  return venueMarkerStyles[venueType as keyof typeof venueMarkerStyles] ?? venueMarkerStyles.other;
}

type BrowseSummaryOptions = {
  confirmedDealsOnly?: boolean;
  informalBusinessesOnly?: boolean;
  selectedDealDays?: WeekdayFilterValue[];
  selectedOperatingDays?: WeekdayFilterValue[];
  verifiedBusinessesOnly?: boolean;
};

export function getBrowseSummaryLabel(
  selectedCity: CityFilterValue,
  selectedVenueTypes: VenueFilterValue[],
  searchQuery: string,
  options: BrowseSummaryOptions = {},
) {
  const summaryParts: string[] = [];

  if (selectedCity !== 'all') {
    const cityLabel = cityFilters.find((filter) => filter.value === selectedCity)?.label ?? selectedCity;
    summaryParts.push(cityLabel);
  }

  if (selectedVenueTypes.length !== venueFilters.length) {
    summaryParts.push(`${selectedVenueTypes.length} types`);
  }

  if (options.confirmedDealsOnly) {
    summaryParts.push('Deals only');
  }

  if (options.informalBusinessesOnly) {
    summaryParts.push('Small Startups & Vendors');
  }

  if ((options.selectedOperatingDays ?? []).length) {
    summaryParts.push(`${options.selectedOperatingDays?.length ?? 0} hours days`);
  }

  if ((options.selectedDealDays ?? []).length) {
    summaryParts.push(`${options.selectedDealDays?.length ?? 0} deal days`);
  }

  if (options.verifiedBusinessesOnly) {
    summaryParts.push('Claimed / Verified');
  }

  return summaryParts.length ? summaryParts.join(' • ') : 'All Cities • All Venue Types';
}

export function getBrowseEmptyStateMessage(searchQuery: string) {
  if (searchQuery.length) {
    return 'No places matched that search and filter combination yet.';
  }

  return 'No places matched the current filters yet.';
}
