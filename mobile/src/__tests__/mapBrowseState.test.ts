import { shouldSkipBrowseMapAutoFit } from '../mapBrowseState';

describe('shouldSkipBrowseMapAutoFit', () => {
  it('skips auto-fit when browse map is hidden', () => {
    expect(shouldSkipBrowseMapAutoFit({
      listLoading: false,
      mappedPlaceCount: 4,
      normalizedSearchQuery: '',
      showMapBrowse: false,
    })).toBe(true);
  });

  it('skips auto-fit while places are loading', () => {
    expect(shouldSkipBrowseMapAutoFit({
      listLoading: true,
      mappedPlaceCount: 4,
      normalizedSearchQuery: 'baskin',
      showMapBrowse: true,
    })).toBe(true);
  });

  it('skips auto-fit for non-empty mistyped searches with zero map matches', () => {
    expect(shouldSkipBrowseMapAutoFit({
      listLoading: false,
      mappedPlaceCount: 0,
      normalizedSearchQuery: 'bh',
      showMapBrowse: true,
    })).toBe(true);

    expect(shouldSkipBrowseMapAutoFit({
      listLoading: false,
      mappedPlaceCount: 0,
      normalizedSearchQuery: 'zr',
      showMapBrowse: true,
    })).toBe(true);
  });

  it('allows auto-fit when a non-empty search still has map matches', () => {
    expect(shouldSkipBrowseMapAutoFit({
      listLoading: false,
      mappedPlaceCount: 2,
      normalizedSearchQuery: 'ba',
      showMapBrowse: true,
    })).toBe(false);
  });

  it('allows auto-fit for empty search with zero results so the default region can still be restored', () => {
    expect(shouldSkipBrowseMapAutoFit({
      listLoading: false,
      mappedPlaceCount: 0,
      normalizedSearchQuery: '',
      showMapBrowse: true,
    })).toBe(false);
  });
});