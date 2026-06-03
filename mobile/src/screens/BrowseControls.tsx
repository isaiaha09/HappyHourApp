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
  listModeEnabled?: boolean;
  onChangeSearchQuery: (value: string) => void;
  onClearSearchQuery: () => void;
  onBrowseModeChange: (mode: BrowseMode) => void;
  onOpenDashboard?: () => void;
  onReload: () => void;
  onSelectAllVenueTypes: () => void;
  onSelectCity: (city: CityFilterValue) => void;
  onToggleSearchPanelLift?: () => void;
  onToggleConfirmedDealsOnly: () => void;
  onToggleDealDay: (day: WeekdayFilterValue) => void;
  onToggleFilters: () => void;
  onToggleMapTheme?: () => void;
  onToggleOperatingDay: (day: WeekdayFilterValue) => void;
  onToggleVenueType: (venueType: VenueFilterValue) => void;
  onToggleVerifiedBusinessesOnly: () => void;
  resultCount: number;
  searchPanelLifted?: boolean;
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
  listModeEnabled = true,
  onChangeSearchQuery,
  onClearSearchQuery,
  onBrowseModeChange,
  onOpenDashboard,
  onReload,
  onSelectAllVenueTypes,
  onSelectCity,
  onToggleSearchPanelLift,
  onToggleConfirmedDealsOnly,
  onToggleDealDay,
  onToggleFilters,
  onToggleMapTheme,
  onToggleOperatingDay,
  onToggleVenueType,
  onToggleVerifiedBusinessesOnly,
  resultCount,
  searchPanelLifted = false,
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
  const collapsedSearchBodyMaxHeight = filtersPanelMaxHeight + (compactLandscapeControls ? 112 : 148);
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
  const filtersPanelProgress = useRef(new Animated.Value(filtersExpanded ? 1 : 0)).current;
  const mapThemeToggleProgress = useRef(new Animated.Value(isDarkMapMode ? 1 : 0)).current;
  const searchPanelLiftProgress = useRef(new Animated.Value(searchPanelLifted ? 1 : 0)).current;
  const listLabelColor = modeSwitchColorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#f4fffe', '#5d4637'],
  });
  const mapLabelColor = modeSwitchColorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#5d4637', '#f4fffe'],
  });
  const filtersPanelOpacity = filtersPanelProgress.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 0.35, 1],
  });
  const filtersPanelTranslateY = filtersPanelProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 0],
  });
  const filtersPanelAnimatedMaxHeight = filtersPanelProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, filtersPanelMaxHeight],
  });
  const filtersToggleBackgroundColor = filtersPanelProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#fff7ef', '#402214'],
  });
  const filtersToggleBorderColor = filtersPanelProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#ddc4a7', '#402214'],
  });
  const filtersToggleTextColor = filtersPanelProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#5d4637', '#fff7ef'],
  });
  const mapThemeToggleBackgroundColor = mapThemeToggleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#fff7ef', '#2d403f'],
  });
  const mapThemeToggleBorderColor = mapThemeToggleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#ddc4a7', '#2d403f'],
  });
  const mapThemeToggleSunOpacity = mapThemeToggleProgress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [1, 0, 0],
  });
  const mapThemeToggleMoonOpacity = mapThemeToggleProgress.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, 0, 1],
  });
  const mapThemeToggleSunScale = mapThemeToggleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.8],
  });
  const mapThemeToggleMoonScale = mapThemeToggleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });
  const mapThemeToggleSunRotate = mapThemeToggleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-50deg'],
  });
  const mapThemeToggleMoonRotate = mapThemeToggleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['50deg', '0deg'],
  });
  const searchPanelBodyOpacity = searchPanelLiftProgress.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [1, 0.5, 0],
  });
  const searchPanelBodyTranslateY = searchPanelLiftProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });
  const searchPanelBodyMaxHeight = searchPanelLiftProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedSearchBodyMaxHeight, 0],
  });
  const searchPanelChevronLeftRotate = searchPanelLiftProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-45deg', '45deg'],
  });
  const searchPanelChevronRightRotate = searchPanelLiftProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['45deg', '-45deg'],
  });
  const searchPanelChevronArmOffset = searchPanelLiftProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-1, 1],
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

  useEffect(() => {
    Animated.timing(filtersPanelProgress, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
      toValue: filtersExpanded ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [filtersExpanded, filtersPanelProgress]);

  useEffect(() => {
    Animated.timing(mapThemeToggleProgress, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: isDarkMapMode ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [isDarkMapMode, mapThemeToggleProgress]);

  useEffect(() => {
    Animated.timing(searchPanelLiftProgress, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
      toValue: searchPanelLifted ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [searchPanelLiftProgress, searchPanelLifted]);

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
            overlay ? styles.searchInputShellCurtain : null,
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
      <Animated.View
        pointerEvents={searchPanelLifted ? 'none' : 'auto'}
        style={{
          maxHeight: searchPanelBodyMaxHeight,
          opacity: searchPanelBodyOpacity,
          overflow: 'hidden',
          transform: [{ translateY: searchPanelBodyTranslateY }],
        }}
      >
        <View
          style={[
            styles.toolbarRow,
            compactLandscapeControls ? styles.toolbarRowLandscape : null,
            !onOpenDashboard ? styles.toolbarRowLeading : null,
          ]}
        >
          <View style={[styles.toolbarActionsRow, !onOpenDashboard ? styles.toolbarActionsRowFill : styles.toolbarActionsRowWithDashboard]}>
            {listModeEnabled ? (
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
            ) : (
              <View style={styles.secondaryToolbarButton}>
                <Text style={styles.secondaryToolbarButtonText}>Guest Map</Text>
              </View>
            )}
            {onToggleMapTheme ? (
              <Pressable
                accessibilityLabel={isDarkMapMode ? 'Switch to light map' : 'Switch to dark map'}
                onPress={onToggleMapTheme}
                style={styles.mapThemeToggleButton}
              >
                <Animated.View
                  style={[
                    styles.mapThemeToggleButtonFill,
                    {
                      backgroundColor: mapThemeToggleBackgroundColor,
                      borderColor: mapThemeToggleBorderColor,
                    },
                  ]}
                >
                  <Animated.Text
                    style={[
                      styles.mapThemeToggleButtonText,
                      styles.mapThemeToggleButtonTextLayer,
                      {
                        opacity: mapThemeToggleSunOpacity,
                        transform: [{ scale: mapThemeToggleSunScale }, { rotate: mapThemeToggleSunRotate }],
                      },
                    ]}
                  >
                    ☀
                  </Animated.Text>
                  <Animated.Text
                    style={[
                      styles.mapThemeToggleButtonText,
                      styles.mapThemeToggleButtonTextActive,
                      styles.mapThemeToggleButtonTextLayer,
                      {
                        opacity: mapThemeToggleMoonOpacity,
                        transform: [{ scale: mapThemeToggleMoonScale }, { rotate: mapThemeToggleMoonRotate }],
                      },
                    ]}
                  >
                    ☾
                  </Animated.Text>
                </Animated.View>
              </Pressable>
            ) : null}
            <Pressable accessibilityLabel="Refresh places" onPress={onReload} style={styles.reloadButton}>
              <Text style={styles.reloadButtonText}>↻</Text>
            </Pressable>
            <Pressable
              onPress={onToggleFilters}
              style={styles.filtersToggleButtonPressable}
            >
              <Animated.View
                style={[
                  styles.filtersToggleButton,
                  styles.filtersToggleButtonInline,
                  compactLandscapeControls ? styles.filtersToggleButtonLandscape : null,
                  {
                    backgroundColor: filtersToggleBackgroundColor,
                    borderColor: filtersToggleBorderColor,
                  },
                ]}
              >
                <Animated.Text
                  numberOfLines={1}
                  style={[styles.filtersToggleText, styles.filtersToggleTextInline, { color: filtersToggleTextColor }]}
                >
                  {filtersExpanded ? 'Hide filters' : 'Filters'}
                </Animated.Text>
              </Animated.View>
            </Pressable>
          </View>
          {onOpenDashboard ? (
            <Pressable accessibilityLabel="Back to Dashboard" onPress={onOpenDashboard} style={styles.toolbarArrowButton}>
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

        <Animated.View
          pointerEvents={filtersExpanded ? 'auto' : 'none'}
          style={[
            styles.filtersPanel,
            compactLandscapeControls ? styles.filtersPanelLandscape : null,
            {
              maxHeight: filtersPanelAnimatedMaxHeight,
              opacity: filtersPanelOpacity,
              overflow: 'hidden',
              transform: [{ translateY: filtersPanelTranslateY }],
            },
          ]}
        >
          <View style={{ maxHeight: filtersPanelMaxHeight }}>
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
                <Text style={[chipTextStyle, verifiedBusinessesOnly ? chipTextActiveStyle : null]}>Claimed / Verified Businesses</Text>
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
        </Animated.View>
      </Animated.View>
      {overlay && onToggleSearchPanelLift ? (
        <Pressable
          accessibilityLabel={searchPanelLifted ? 'Show search filters' : 'Hide search filters'}
          hitSlop={10}
          onPress={onToggleSearchPanelLift}
          style={styles.searchCurtainToggleInline}
        >
          <View style={styles.mapResultsChevronIcon}>
            <Animated.View
              style={[
                styles.mapResultsChevronLine,
                styles.mapResultsChevronLineLeft,
                {
                  transform: [
                    { translateY: searchPanelChevronArmOffset },
                    { rotate: searchPanelChevronLeftRotate },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.mapResultsChevronLine,
                styles.mapResultsChevronLineRight,
                {
                  transform: [
                    { translateY: searchPanelChevronArmOffset },
                    { rotate: searchPanelChevronRightRotate },
                  ],
                },
              ]}
            />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
