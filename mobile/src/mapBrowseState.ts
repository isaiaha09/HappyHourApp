type BrowseMapAutoFitOptions = {
  listLoading: boolean;
  mappedPlaceCount: number;
  normalizedSearchQuery: string;
  showMapBrowse: boolean;
};

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