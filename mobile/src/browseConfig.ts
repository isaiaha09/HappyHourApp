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
  { label: 'Cafe', value: 'cafe' },
  { label: 'Shop', value: 'shop' },
  { label: 'Attraction', value: 'attraction' },
  { label: 'Other', value: 'other' },
] as const;

export type BrowseMode = 'list' | 'map';
export type VenueFilterValue = (typeof venueFilters)[number]['value'];

export const manualBusinessCityOptions = cityFilters.filter((filter) => filter.value !== 'all');
export const manualBusinessVenueOptions = venueFilters;

const venueMarkerStyles = {
  restaurant: { badge: 'R', fill: '#c65d1f', stroke: '#7f461f' },
  bar: { badge: 'B', fill: '#1f5f5b', stroke: '#143d3a' },
  fast_food: { badge: 'F', fill: '#d94b3d', stroke: '#8d2500' },
  cafe: { badge: 'C', fill: '#8b5e3c', stroke: '#5b3a21' },
  shop: { badge: 'S', fill: '#5f7cc6', stroke: '#34508c' },
  attraction: { badge: 'A', fill: '#7b6ad9', stroke: '#4e42a1' },
  other: { badge: 'O', fill: '#6f5947', stroke: '#43352c' },
} as const;

export function getVenueMarkerStyle(venueType: string) {
  return venueMarkerStyles[venueType as keyof typeof venueMarkerStyles] ?? venueMarkerStyles.other;
}

export function getBrowseSummaryLabel(selectedCity: CityFilterValue, selectedVenueTypes: VenueFilterValue[], searchQuery: string) {
  const summaryParts: string[] = [];

  if (searchQuery.length) {
    summaryParts.push(`Search: ${searchQuery}`);
  }

  if (selectedCity !== 'all') {
    const cityLabel = cityFilters.find((filter) => filter.value === selectedCity)?.label ?? selectedCity;
    summaryParts.push(cityLabel);
  }

  if (selectedVenueTypes.length !== venueFilters.length) {
    summaryParts.push(`${selectedVenueTypes.length} types`);
  }

  return summaryParts.length ? summaryParts.join(' • ') : 'All cities • all venue types';
}

export function getBrowseEmptyStateMessage(searchQuery: string) {
  if (searchQuery.length) {
    return 'No places matched that search and filter combination yet.';
  }

  return 'No places matched the current filters yet.';
}
