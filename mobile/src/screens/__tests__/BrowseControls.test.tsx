import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { venueFilters, type CityFilterValue, type VenueFilterValue, type WeekdayFilterValue } from '../../browseConfig';
import { BrowseControls, type BrowseControlsProps } from '../BrowseControls';

function createProps(overrides: Partial<BrowseControlsProps> = {}): BrowseControlsProps {
  return {
    browseMode: 'map',
    confirmedDealsOnly: false,
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
    onToggleFilters: jest.fn(),
    onToggleInformalBusinessesOnly: jest.fn(),
    onToggleOperatingDay: jest.fn() as jest.MockedFunction<(day: WeekdayFilterValue) => void>,
    onToggleVenueType: jest.fn() as jest.MockedFunction<(venueType: VenueFilterValue) => void>,
    onToggleVerifiedBusinessesOnly: jest.fn(),
    resultCount: 12,
    searchQuery: '',
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
});