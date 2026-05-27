import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import {
  cityFilters,
  getBrowseSummaryLabel,
  getVenueMarkerStyle,
  type BrowseMode,
  type CityFilterValue,
  venueFilters,
  type VenueFilterValue,
  weekdayFilters,
  type WeekdayFilterValue,
} from '../browseConfig';
import { styles } from '../appStyles';
import { normalizeSearchText } from '../placeHelpers';

export type BrowseControlsProps = {
  browseMode: BrowseMode;
  confirmedDealsOnly: boolean;
  overlay?: boolean;
  filtersExpanded: boolean;
  isDarkMapMode?: boolean;
  onChangeSearchQuery: (value: string) => void;
  onClearSearchQuery: () => void;
  onBrowseModeChange: (mode: BrowseMode) => void;
  onOpenDashboard?: () => void;
  onReload: () => void;
  onSelectAllVenueTypes: () => void;
  onSelectCity: (city: CityFilterValue) => void;
  onToggleConfirmedDealsOnly: () => void;
  onToggleDealDay: (day: WeekdayFilterValue) => void;
  onToggleFilters: () => void;
  onToggleMapTheme?: () => void;
  onToggleOperatingDay: (day: WeekdayFilterValue) => void;
  onToggleVenueType: (venueType: VenueFilterValue) => void;
  onToggleVerifiedBusinessesOnly: () => void;
  resultCount: number;
  searchQuery: string;
  selectedDealDays: WeekdayFilterValue[];
  selectedCity: CityFilterValue;
  selectedOperatingDays: WeekdayFilterValue[];
  selectedVenueTypes: VenueFilterValue[];
  verifiedBusinessesOnly: boolean;
};

export function BrowseControls({
  browseMode,
  confirmedDealsOnly,
  overlay = false,
  filtersExpanded,
  isDarkMapMode = false,
  onChangeSearchQuery,
  onClearSearchQuery,
  onBrowseModeChange,
  onOpenDashboard,
  onReload,
  onSelectAllVenueTypes,
  onSelectCity,
  onToggleConfirmedDealsOnly,
  onToggleDealDay,
  onToggleFilters,
  onToggleMapTheme,
  onToggleOperatingDay,
  onToggleVenueType,
  onToggleVerifiedBusinessesOnly,
  resultCount,
  searchQuery,
  selectedDealDays,
  selectedCity,
  selectedOperatingDays,
  selectedVenueTypes,
  verifiedBusinessesOnly,
}: BrowseControlsProps) {
  const { height, width } = useWindowDimensions();
  const compactLandscapeControls = width > height && width >= 760;
  const modeSwitchThumbWidth = compactLandscapeControls ? 50 : 58;
  const modeSwitchTrackWidth = modeSwitchThumbWidth * 2 + 8;
  const filtersPanelMaxHeight = Math.max(
    compactLandscapeControls ? Math.min(height * 0.42, 260) : Math.min(height * 0.5, 420),
    compactLandscapeControls ? 180 : 220,
  );
  const landscapeControlsWidth = compactLandscapeControls
    ? Math.min(width - 32, overlay ? 560 : 620)
    : null;
  const chipStyle = overlay ? styles.overlayChip : styles.filterChip;
  const chipActiveStyle = overlay ? styles.overlayChipActive : styles.filterChipActive;
  const chipTextStyle = overlay ? styles.overlayChipText : styles.filterChipText;
  const chipTextActiveStyle = overlay ? styles.overlayChipTextActive : styles.filterChipTextActive;
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const modeSwitchTranslateProgress = useRef(new Animated.Value(browseMode === 'map' ? 1 : 0)).current;
  const modeSwitchColorProgress = useRef(new Animated.Value(browseMode === 'map' ? 1 : 0)).current;
  const listLabelColor = modeSwitchColorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#f4fffe', '#5d4637'],
  });
  const mapLabelColor = modeSwitchColorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#5d4637', '#f4fffe'],
  });

  useEffect(() => {
    Animated.timing(modeSwitchTranslateProgress, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: browseMode === 'map' ? 1 : 0,
      useNativeDriver: true,
    }).start();

    Animated.timing(modeSwitchColorProgress, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: browseMode === 'map' ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [browseMode, modeSwitchColorProgress, modeSwitchTranslateProgress]);

  return (
    <View
      style={[
        overlay ? styles.mapTopPanel : styles.browseHeaderCard,
        compactLandscapeControls ? (overlay ? styles.mapTopPanelLandscape : styles.browseHeaderCardLandscape) : null,
        landscapeControlsWidth ? { width: landscapeControlsWidth } : null,
      ]}
    >
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
      </View>

      <View
        style={[
          styles.toolbarRow,
          compactLandscapeControls ? styles.toolbarRowLandscape : null,
          !onOpenDashboard ? styles.toolbarRowLeading : null,
        ]}
      >
        <View style={[styles.toolbarActionsRow, !onOpenDashboard ? styles.toolbarActionsRowFill : null]}>
          <View
            style={[
              styles.modeSwitcherTrack,
              overlay ? styles.modeSwitcherTrackOverlay : null,
              { width: modeSwitchTrackWidth },
            ]}
          >
            <Animated.View
              style={[
                styles.modeSwitcherThumb,
                {
                  width: modeSwitchThumbWidth,
                  transform: [{
                    translateX: modeSwitchTranslateProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, modeSwitchThumbWidth],
                    }),
                  }],
                },
              ]}
            />
            <Pressable
              onPress={() => onBrowseModeChange('list')}
              style={[styles.modeSwitchOption, { width: modeSwitchThumbWidth }]}
            >
              <Animated.Text style={[styles.modeSwitchOptionText, { color: listLabelColor }]}>List</Animated.Text>
            </Pressable>
            <Pressable
              onPress={() => onBrowseModeChange('map')}
              style={[styles.modeSwitchOption, { width: modeSwitchThumbWidth }]}
            >
              <Animated.Text style={[styles.modeSwitchOptionText, { color: mapLabelColor }]}>Map</Animated.Text>
            </Pressable>
          </View>
          {onToggleMapTheme ? (
            <Pressable
              accessibilityLabel={isDarkMapMode ? 'Switch to light map' : 'Switch to dark map'}
              onPress={onToggleMapTheme}
              style={[styles.mapThemeToggleButton, isDarkMapMode ? styles.mapThemeToggleButtonActive : null]}
            >
              <Text style={[styles.mapThemeToggleButtonText, isDarkMapMode ? styles.mapThemeToggleButtonTextActive : null]}>
                {isDarkMapMode ? '☾' : '☀'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityLabel="Refresh places" onPress={onReload} style={styles.reloadButton}>
            <Text style={styles.reloadButtonText}>↻</Text>
          </Pressable>
          <Pressable
            onPress={onToggleFilters}
            style={[
              styles.filtersToggleButton,
              styles.filtersToggleButtonInline,
              compactLandscapeControls ? styles.filtersToggleButtonLandscape : null,
              filtersExpanded ? styles.filtersToggleButtonActive : null,
            ]}
          >
            <Text style={[styles.filtersToggleText, filtersExpanded ? styles.filtersToggleTextActive : null]}>
              {filtersExpanded ? 'Hide filters' : 'Filters'}
            </Text>
          </Pressable>
        </View>
        {onOpenDashboard ? (
          <Pressable accessibilityLabel="Back to dashboard" onPress={onOpenDashboard} style={styles.toolbarArrowButton}>
            <Text style={styles.toolbarArrowButtonText}>→</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.browseStatsRow, compactLandscapeControls ? styles.browseStatsRowLandscape : null]}>
        <Text style={styles.browseStatsText}>{resultCount} {resultCount === 1 ? 'place' : 'places'}</Text>
        <Text numberOfLines={1} style={styles.browseStatsSubtleText}>
          {getBrowseSummaryLabel(selectedCity, selectedVenueTypes, normalizedSearchQuery, {
            confirmedDealsOnly,
            selectedDealDays,
            selectedOperatingDays,
            verifiedBusinessesOnly,
          })}
        </Text>
      </View>

      {filtersExpanded ? (
        <View
          style={[
            styles.filtersPanel,
            compactLandscapeControls ? styles.filtersPanelLandscape : null,
            { maxHeight: filtersPanelMaxHeight },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.filtersPanelScrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
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
              nestedScrollEnabled
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

            <View style={styles.browseSectionHeaderRow}>
              <Text style={styles.browseSectionTitle}>Trust and Deals</Text>
              <Text style={styles.browseSectionMeta}>Tighten the Results</Text>
            </View>
            <View style={styles.filterRow}>
              <Pressable
                onPress={onToggleConfirmedDealsOnly}
                style={[chipStyle, confirmedDealsOnly ? chipActiveStyle : null]}
              >
                <Text style={[chipTextStyle, confirmedDealsOnly ? chipTextActiveStyle : null]}>Confirmed Happy Hour/Deals</Text>
              </Pressable>
              <Pressable
                onPress={onToggleVerifiedBusinessesOnly}
                style={[chipStyle, verifiedBusinessesOnly ? chipActiveStyle : null]}
              >
                <Text style={[chipTextStyle, verifiedBusinessesOnly ? chipTextActiveStyle : null]}>Verified Businesses</Text>
              </Pressable>
            </View>

            <View style={styles.browseSectionHeaderRow}>
              <Text style={styles.browseSectionTitle}>Hours of Operation</Text>
              <Text style={styles.browseSectionMeta}>Sunday through Saturday</Text>
            </View>
            <View style={styles.filterRow}>
              {weekdayFilters.map((filter) => {
                const isActive = selectedOperatingDays.includes(filter.value);

                return (
                  <Pressable
                    key={`hours-${filter.value}`}
                    onPress={() => onToggleOperatingDay(filter.value)}
                    style={[chipStyle, isActive ? chipActiveStyle : null]}
                  >
                    <Text style={[chipTextStyle, isActive ? chipTextActiveStyle : null]}>{filter.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.browseSectionHeaderRow}>
              <Text style={styles.browseSectionTitle}>Happy Hour Days</Text>
              <Text style={styles.browseSectionMeta}>Separate from Business Hours</Text>
            </View>
            <View style={styles.filterRow}>
              {weekdayFilters.map((filter) => {
                const isActive = selectedDealDays.includes(filter.value);

                return (
                  <Pressable
                    key={`deals-${filter.value}`}
                    onPress={() => onToggleDealDay(filter.value)}
                    style={[chipStyle, isActive ? chipActiveStyle : null]}
                  >
                    <Text style={[chipTextStyle, isActive ? chipTextActiveStyle : null]}>{filter.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
