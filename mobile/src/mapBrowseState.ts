type BrowseMapAutoFitOptions = {
  listLoading: boolean;
  mappedPlaceCount: number;
  normalizedSearchQuery: string;
  showMapBrowse: boolean;
};

type MappedPlaceRenderKeyInput = {
  latitude: number;
  longitude: number;
  markerKey: string;
};

export function getMappedPlaceRenderKey(mappedPlaces: MappedPlaceRenderKeyInput[]) {
  return mappedPlaces.map((place) => (
    `${place.markerKey}:${place.latitude}:${place.longitude}`
  )).join('|');
}

export function shouldSkipBrowseMapAutoFit({
  listLoading,
  mappedPlaceCount,
  normalizedSearchQuery,
  showMapBrowse,
}: BrowseMapAutoFitOptions) {
  if (!showMapBrowse || listLoading) {
    return true;
  }

  return normalizedSearchQuery.length > 0 && mappedPlaceCount === 0;
}