import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { venueFilters, type CityFilterValue, type VenueFilterValue, type WeekdayFilterValue } from '../../browseConfig';
import { BrowseControls, type BrowseControlsProps } from '../BrowseControls';

function createProps(overrides: Partial<BrowseControlsProps> = {}): BrowseControlsProps {
  return {
    browseMode: 'map',
    confirmedDealsOnly: false,
    favoriteBusinessesOnly: false,
    filtersExpanded: false,
    informalBusinessesOnly: false,
    onBrowseModeChange: jest.fn(),
    onChangeSearchQuery: jest.fn(),
    onClearSearchQuery: jest.fn(),
    onReload: jest.fn(),
    onSelectAllVenueTypes: jest.fn(),
    onSelectCity: jest.fn() as jest.MockedFunction<(city: CityFilterValue) => void>,
    onToggleConfirmedDealsOnly: jest.fn(),
    onToggleDealDay: jest.fn() as jest.MockedFunction<(day: WeekdayFilterValue) => void>,
    onToggleFavoriteBusinessesOnly: jest.fn(),
    onToggleFilters: jest.fn(),
    onToggleInformalBusinessesOnly: jest.fn(),
    onToggleOperatingDay: jest.fn() as jest.MockedFunction<(day: WeekdayFilterValue) => void>,
    onToggleVenueType: jest.fn() as jest.MockedFunction<(venueType: VenueFilterValue) => void>,
    onToggleVerifiedBusinessesOnly: jest.fn(),
    resultCount: 12,
    searchQuery: '',
    showFavoriteBusinessesFilter: false,
    selectedCity: 'all',
    selectedDealDays: [],
    selectedOperatingDays: [],
    selectedVenueTypes: venueFilters.map((filter) => filter.value),
    verifiedBusinessesOnly: false,
    ...overrides,
  };
}

describe('BrowseControls', () => {
  it('handles rapid search typing and repeated panel toggles without breaking event wiring', () => {
    jest.useFakeTimers();

    const onChangeSearchQuery = jest.fn();
    const onClearSearchQuery = jest.fn();
    const onToggleFilters = jest.fn();
    const props = createProps({
      onChangeSearchQuery,
      onClearSearchQuery,
      onToggleFilters,
    });

    const { rerender, unmount } = render(<BrowseControls {...props} />);
    const values = ['b', 'ba', 'bas', 'bask', 'baski', 'baskin', 'baskin r', 'baskin robbins'];

    for (const [index, value] of values.entries()) {
      fireEvent.changeText(screen.getByTestId('browse-search-input'), value);
      rerender(
        <BrowseControls
          {...props}
          filtersExpanded={index % 2 === 0}
          searchPanelLifted={index % 3 === 0}
          searchQuery={value}
        />,
      );
    }

    fireEvent.press(screen.getByText('Filters'));
    fireEvent.press(screen.getByTestId('browse-search-clear-button'));

    act(() => {
      jest.runOnlyPendingTimers();
    });

    unmount();

    act(() => {
      jest.runOnlyPendingTimers();
    });

    jest.useRealTimers();

    expect(onChangeSearchQuery).toHaveBeenCalledTimes(values.length);
    expect(onChangeSearchQuery).toHaveBeenLastCalledWith('baskin robbins');
    expect(onToggleFilters).toHaveBeenCalledTimes(1);
    expect(onClearSearchQuery).toHaveBeenCalledTimes(1);
  });

  it('notifies the parent when the search field is activated', () => {
    jest.useFakeTimers();
    const onActivateSearch = jest.fn();

    const { unmount } = render(<BrowseControls {...createProps({ onActivateSearch })} />);

    const searchInput = screen.getByTestId('browse-search-input');
    fireEvent(searchInput, 'pressIn');

    expect(onActivateSearch).toHaveBeenCalledTimes(1);

    unmount();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('uses a light search surface when the map is in light mode', () => {
    jest.useFakeTimers();
    const { getByTestId, unmount } = render(<BrowseControls {...createProps({ overlay: true, isDarkMapMode: false })} />);

    expect(StyleSheet.flatten(getByTestId('browse-search-shell').props.style)).toEqual(
      expect.objectContaining({ backgroundColor: 'rgba(255, 255, 255, 0.94)' }),
    );
    expect(getByTestId('browse-search-input').props.placeholderTextColor).toBe('#68756b');

    unmount();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('keeps the dark search surface when the map is in dark mode', () => {
    jest.useFakeTimers();
    const { getByTestId, unmount } = render(<BrowseControls {...createProps({ overlay: true, isDarkMapMode: true })} />);

    expect(StyleSheet.flatten(getByTestId('browse-search-shell').props.style)).toEqual(
      expect.objectContaining({ backgroundColor: 'rgba(24, 25, 31, 0.94)' }),
    );
    expect(getByTestId('browse-search-input').props.placeholderTextColor).toBe('#7f8597');

    unmount();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('preserves light filter chip styling when the filter panel is expanded', () => {
    jest.useFakeTimers();
    const { getByTestId, unmount } = render(
      <BrowseControls
        {...createProps({
          confirmedDealsOnly: true,
          filtersExpanded: true,
          isDarkMapMode: false,
          overlay: true,
        })}
      />,
    );

    expect(StyleSheet.flatten(getByTestId('browse-city-filter-all').props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: '#ff695c',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }),
    );
    expect(StyleSheet.flatten(getByTestId('browse-all-venue-types-filter').props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: '#ff695c',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }),
    );
    expect(StyleSheet.flatten(getByTestId('browse-confirmed-deals-filter').props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: '#ff695c',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }),
    );

    unmount();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });
});
