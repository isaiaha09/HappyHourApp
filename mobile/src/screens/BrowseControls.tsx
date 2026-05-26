import { TextInput, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { cityFilters, getBrowseSummaryLabel, getVenueMarkerStyle, type BrowseMode, type CityFilterValue, venueFilters, type VenueFilterValue } from '../browseConfig';
import { styles } from '../appStyles';
import { normalizeSearchText } from '../placeHelpers';

export type BrowseControlsProps = {
  overlay?: boolean;
  filtersExpanded: boolean;
  onChangeSearchQuery: (value: string) => void;
  onClearSearchQuery: () => void;
  onOpenDashboard?: () => void;
  onReload: () => void;
  onSelectAllVenueTypes: () => void;
  onSelectCity: (city: CityFilterValue) => void;
  onToggleFilters: () => void;
  onToggleVenueType: (venueType: VenueFilterValue) => void;
  resultCount: number;
  searchQuery: string;
  selectedCity: CityFilterValue;
  selectedVenueTypes: VenueFilterValue[];
};

export type BrowseModeSwitcherProps = {
  browseMode: BrowseMode;
  onBrowseModeChange: (mode: BrowseMode) => void;
  overlay?: boolean;
};

export function BrowseControls({
  overlay = false,
  filtersExpanded,
  onChangeSearchQuery,
  onClearSearchQuery,
  onOpenDashboard,
  onReload,
  onSelectAllVenueTypes,
  onSelectCity,
  onToggleFilters,
  onToggleVenueType,
  resultCount,
  searchQuery,
  selectedCity,
  selectedVenueTypes,
}: BrowseControlsProps) {
  const { height, width } = useWindowDimensions();
  const compactLandscapeControls = width > height && width >= 760;
  const landscapeControlsWidth = compactLandscapeControls
    ? Math.min(width - 32, overlay ? 560 : 620)
    : null;
  const chipStyle = overlay ? styles.overlayChip : styles.filterChip;
  const chipActiveStyle = overlay ? styles.overlayChipActive : styles.filterChipActive;
  const chipTextStyle = overlay ? styles.overlayChipText : styles.filterChipText;
  const chipTextActiveStyle = overlay ? styles.overlayChipTextActive : styles.filterChipTextActive;
  const normalizedSearchQuery = normalizeSearchText(searchQuery);

  return (
    <View
      style={[
        overlay ? styles.mapTopPanel : styles.browseHeaderCard,
        compactLandscapeControls ? (overlay ? styles.mapTopPanelLandscape : styles.browseHeaderCardLandscape) : null,
        landscapeControlsWidth ? { width: landscapeControlsWidth } : null,
      ]}
    >
      <View style={[styles.toolbarRow, compactLandscapeControls ? styles.toolbarRowLandscape : null]}>
        <Text
          style={[
            overlay ? styles.mapAppTitle : styles.appTitle,
            compactLandscapeControls ? styles.controlsTitleLandscape : null,
          ]}
        >
          HappyHourApp
        </Text>
        <View style={styles.toolbarActionsRow}>
          {onOpenDashboard ? (
            <Pressable onPress={onOpenDashboard} style={styles.secondaryToolbarButton}>
              <Text style={styles.secondaryToolbarButtonText}>Back to Dashboard</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onReload} style={styles.reloadButton}>
            <Text style={styles.reloadButtonText}>Refresh Places</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.searchRow, compactLandscapeControls ? styles.searchRowLandscape : null]}>
        <View
          style={[
            styles.searchInputShell,
            overlay ? styles.searchInputShellOverlay : null,
            compactLandscapeControls ? styles.searchInputShellLandscape : null,
          ]}
        >
          <Text style={styles.searchInputIcon}>Find</Text>
          <TextInput
            onChangeText={onChangeSearchQuery}
            placeholder="Search restaurants, bars, etc."
            placeholderTextColor="#9a7f6c"
            style={styles.searchInput}
            value={searchQuery}
          />
          {searchQuery.length ? (
            <Pressable hitSlop={8} onPress={onClearSearchQuery} style={styles.searchClearButton}>
              <Text style={styles.searchClearButtonText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={onToggleFilters}
          style={[
            styles.filtersToggleButton,
            compactLandscapeControls ? styles.filtersToggleButtonLandscape : null,
            filtersExpanded ? styles.filtersToggleButtonActive : null,
          ]}
        >
          <Text style={[styles.filtersToggleText, filtersExpanded ? styles.filtersToggleTextActive : null]}>
            {filtersExpanded ? 'Hide filters' : 'Filters'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.browseStatsRow, compactLandscapeControls ? styles.browseStatsRowLandscape : null]}>
        <Text style={styles.browseStatsText}>{resultCount} {resultCount === 1 ? 'place' : 'places'}</Text>
        <Text numberOfLines={1} style={styles.browseStatsSubtleText}>
          {getBrowseSummaryLabel(selectedCity, selectedVenueTypes, normalizedSearchQuery)}
        </Text>
      </View>

      {filtersExpanded ? (
        <View style={[styles.filtersPanel, compactLandscapeControls ? styles.filtersPanelLandscape : null]}>
          <View style={styles.browseSectionHeaderRow}>
            <Text style={styles.browseSectionTitle}>City</Text>
            <Text style={styles.browseSectionMeta}>Quick scope</Text>
          </View>
          <View style={styles.filterRow}>
            {cityFilters.map((filter) => {
              const isActive = filter.value === selectedCity;

              return (
                <Pressable
                  key={filter.value}
                  onPress={() => onSelectCity(filter.value)}
                  style={[chipStyle, isActive ? chipActiveStyle : null]}
                >
                  <Text style={[chipTextStyle, isActive ? chipTextActiveStyle : null]}>{filter.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            contentContainerStyle={styles.venueFilterRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <Pressable
              onPress={onSelectAllVenueTypes}
              style={[chipStyle, selectedVenueTypes.length === venueFilters.length ? chipActiveStyle : null]}
            >
              <Text style={[chipTextStyle, selectedVenueTypes.length === venueFilters.length ? chipTextActiveStyle : null]}>All types</Text>
            </Pressable>
            {venueFilters.map((filter) => {
              const isActive = selectedVenueTypes.includes(filter.value);
              const markerStyle = getVenueMarkerStyle(filter.value);

              return (
                <Pressable
                  key={filter.value}
                  onPress={() => onToggleVenueType(filter.value)}
                  style={[styles.venueFilterChip, isActive ? styles.venueFilterChipActive : null]}
                >
                  <View style={[styles.venueFilterBadge, { backgroundColor: markerStyle.fill, borderColor: markerStyle.stroke }]}>
                    <Text style={styles.venueFilterBadgeText}>{markerStyle.badge}</Text>
                  </View>
                  <Text style={[chipTextStyle, isActive ? chipTextActiveStyle : null]}>{filter.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function BrowseModeSwitcher({ browseMode, onBrowseModeChange, overlay = false }: BrowseModeSwitcherProps) {
  return (
    <View style={[styles.modeSwitcherDock, overlay ? styles.modeSwitcherDockOverlay : null]}>
      <View style={styles.modeSwitcherCard}>
        <Pressable
          onPress={() => onBrowseModeChange('list')}
          style={[styles.modeButton, browseMode === 'list' ? styles.modeButtonActive : null]}
        >
          <Text style={[styles.modeButtonText, browseMode === 'list' ? styles.modeButtonTextActive : null]}>List</Text>
        </Pressable>
        <Pressable
          onPress={() => onBrowseModeChange('map')}
          style={[styles.modeButton, browseMode === 'map' ? styles.modeButtonActive : null]}
        >
          <Text style={[styles.modeButtonText, browseMode === 'map' ? styles.modeButtonTextActive : null]}>Map</Text>
        </Pressable>
      </View>
    </View>
  );
}
