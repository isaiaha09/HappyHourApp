import { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Keyboard,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, type Region } from 'react-native-maps';

import { fetchPlaceDetail, fetchPlaces, getDefaultApiBaseUrl } from './src/api';
import type { HappyHourWindow, OperatingHourWindow, PlaceDetail, PlaceListItem, PlaceLocation, PlaceLocationDetail } from './src/types';

const cityFilters = [
  { label: 'All 805', value: 'all' },
  { label: 'Ventura', value: 'ventura' },
  { label: 'Oxnard', value: 'oxnard' },
  { label: 'Camarillo', value: 'camarillo' },
] as const;

type CityFilterValue = (typeof cityFilters)[number]['value'];

const initialApiBaseUrl = getDefaultApiBaseUrl();
const mapAreaBounds = {
  minLatitude: 34.0,
  maxLatitude: 34.5,
  minLongitude: -119.55,
  maxLongitude: -118.85,
};
const minLatitudeDelta = 0.01;
const minLongitudeDelta = 0.01;
const maxLatitudeDelta = 0.24;
const maxLongitudeDelta = 0.32;
const mapFitPaddingFactor = 1.15;
const markerClusterThreshold = 0.003;
const markerClusterRadius = 0.0021;
const markerMinimumVisibleRadius = 0.00045;
const markerClusterRingSpacing = 0.0011;
const defaultMapRegion = {
  latitude: (mapAreaBounds.minLatitude + mapAreaBounds.maxLatitude) / 2,
  longitude: (mapAreaBounds.minLongitude + mapAreaBounds.maxLongitude) / 2,
  latitudeDelta: maxLatitudeDelta,
  longitudeDelta: maxLongitudeDelta,
};
const cityMapRegions: Record<Exclude<CityFilterValue, 'all'>, Region> = {
  ventura: {
    latitude: 34.2805,
    longitude: -119.255,
    latitudeDelta: 0.12,
    longitudeDelta: 0.14,
  },
  oxnard: {
    latitude: 34.2001,
    longitude: -119.1806,
    latitudeDelta: 0.12,
    longitudeDelta: 0.14,
  },
  camarillo: {
    latitude: 34.2164,
    longitude: -119.0376,
    latitudeDelta: 0.11,
    longitudeDelta: 0.13,
  },
};
const venueMarkerStyles = {
  restaurant: { badge: 'R', fill: '#c65d1f', stroke: '#7f461f' },
  bar: { badge: 'B', fill: '#1f5f5b', stroke: '#143d3a' },
  fast_food: { badge: 'F', fill: '#d94b3d', stroke: '#8d2500' },
  cafe: { badge: 'C', fill: '#8b5e3c', stroke: '#5b3a21' },
  shop: { badge: 'S', fill: '#5f7cc6', stroke: '#34508c' },
  attraction: { badge: 'A', fill: '#7b6ad9', stroke: '#4e42a1' },
  other: { badge: 'O', fill: '#6f5947', stroke: '#43352c' },
} as const;
const venueFilters = [
  { label: 'Restaurant', value: 'restaurant' },
  { label: 'Bar', value: 'bar' },
  { label: 'Fast Food', value: 'fast_food' },
  { label: 'Cafe', value: 'cafe' },
  { label: 'Shop', value: 'shop' },
  { label: 'Attraction', value: 'attraction' },
  { label: 'Other', value: 'other' },
] as const;

type BrowseMode = 'list' | 'map';
type VenueFilterValue = (typeof venueFilters)[number]['value'];

type MappedPlace = PlaceListItem & {
  latitude: number;
  longitude: number;
  fullAddress: string;
  locationId: number;
  markerLatitude: number;
  markerLongitude: number;
  markerKey: string;
};

type BrowseControlsProps = {
  overlay?: boolean;
  browseMode: BrowseMode;
  filtersExpanded: boolean;
  onBrowseModeChange: (mode: BrowseMode) => void;
  onChangeSearchQuery: (value: string) => void;
  onClearSearchQuery: () => void;
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

export default function App() {
  return (
    <SafeAreaProvider>
      <AppScreen />
    </SafeAreaProvider>
  );
}

function AppScreen() {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const mapRef = useRef<MapView | null>(null);
  const screenTransition = useRef(new Animated.Value(1)).current;
  const mapResultsOpacity = useRef(new Animated.Value(0)).current;
  const [apiBaseUrl, setApiBaseUrl] = useState(initialApiBaseUrl);
  const [browseMode, setBrowseMode] = useState<BrowseMode>('list');
  const [browseFiltersExpanded, setBrowseFiltersExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<(typeof cityFilters)[number]['value']>('all');
  const [selectedVenueTypes, setSelectedVenueTypes] = useState<VenueFilterValue[]>(() => venueFilters.map((filter) => filter.value));
  const [places, setPlaces] = useState<PlaceListItem[]>([]);
  const [selectedPlaceSlug, setSelectedPlaceSlug] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetail | null>(null);
  const [selectedMapPlaceKey, setSelectedMapPlaceKey] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>(() => clampRegionToBounds(defaultMapRegion));
  const [reloadCount, setReloadCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showMapResultsCard, setShowMapResultsCard] = useState(false);
  const [renderedMapSearchResults, setRenderedMapSearchResults] = useState<MappedPlace[]>([]);
  const [renderedMapResultsKey, setRenderedMapResultsKey] = useState('');
  const [renderedMapResultCount, setRenderedMapResultCount] = useState(0);
  const shouldUseNativeMapBoundaries = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = normalizeSearchText(deferredSearchQuery);

  const filteredPlaces = getFilteredPlaces(places, selectedVenueTypes, normalizedSearchQuery);
  const filteredPlaceKey = filteredPlaces.map((place) => place.id).join('|');

  const mappedPlaces = getDisplayMarkerCoordinates(filteredPlaces.flatMap((place) => (
    getPlaceLocations(place).flatMap((location) => {
      if (location.latitude === null || location.longitude === null) {
        return [];
      }

      return [
        {
          ...place,
          city: location.city,
          city_label: location.city_label,
          address_line_1: location.address_line_1,
          address_line_2: location.address_line_2,
          neighborhood: location.neighborhood,
          state: location.state,
          postal_code: location.postal_code,
          latitude: location.latitude,
          longitude: location.longitude,
          phone_number: location.phone_number,
          website_url: location.website_url,
          image_urls: location.image_urls,
          fullAddress: formatPlaceAddress(location),
          locationId: location.id,
          markerLatitude: location.latitude,
          markerLongitude: location.longitude,
          markerKey: `${place.slug}:${location.id}`,
        },
      ];
    })
  )), mapRegion);
  const unplacedPlaceCount = filteredPlaces.filter((place) => (
    !getPlaceLocations(place).some((location) => location.latitude !== null && location.longitude !== null)
  )).length;
  const selectedMapPlace = selectedMapPlaceKey
    ? mappedPlaces.find((place) => place.markerKey === selectedMapPlaceKey) ?? null
    : null;
  const selectedMapImageUrls = selectedMapPlace ? dedupeImageUrls(selectedMapPlace.image_urls) : [];
  const selectedPlaceLocation = getSelectedPlaceLocation(selectedPlace, selectedLocationId, selectedCity);
  const selectedPlaceDeals = selectedPlaceLocation?.deals ?? selectedPlace?.deals ?? [];
  const selectedPlaceOperatingHours = selectedPlaceLocation?.operating_hours ?? selectedPlace?.operating_hours ?? [];
  const selectedPlaceMapRegion = getPlacePreviewRegion(selectedPlaceLocation ?? selectedPlace);
  const mapSearchResults = normalizedSearchQuery.length ? mappedPlaces.slice(0, 5) : [];
  const mapSearchResultsKey = mapSearchResults.map((place) => place.markerKey).join('|');
  const mapOverlayBottomPadding = keyboardHeight > 0
    ? Math.max(keyboardHeight - insets.bottom, 0) + 12
    : Math.max(insets.bottom + 12, 20);
  const activeScreenKey = selectedPlaceSlug ? 'detail' : browseMode === 'map' ? 'map' : 'list';
  const screenTransitionStyle = {
    opacity: screenTransition,
    transform: [
      {
        translateY: screenTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };

  const showMapBrowse = !selectedPlaceSlug && browseMode === 'map';
  const shouldShowMapResults = showMapBrowse && !selectedMapPlace && normalizedSearchQuery.length > 0;
  const isLandscape = width > height;
  const useWideLandscapeLayout = isLandscape && width >= 760;
  const browseListColumns = useWideLandscapeLayout ? 2 : 1;

  function animateNextLayout() {
    LayoutAnimation.configureNext({
      duration: 220,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  }

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    screenTransition.setValue(0);
    Animated.timing(screenTransition, {
      duration: 240,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [activeScreenKey, screenTransition]);

  useEffect(() => {
    if (shouldShowMapResults) {
      const resultsChanged = (
        mapSearchResultsKey !== renderedMapResultsKey ||
        filteredPlaces.length !== renderedMapResultCount
      );

      if (resultsChanged) {
        setRenderedMapSearchResults(mapSearchResults);
        setRenderedMapResultsKey(mapSearchResultsKey);
        setRenderedMapResultCount(filteredPlaces.length);
      }

      if (!showMapResultsCard) {
        setShowMapResultsCard(true);
        mapResultsOpacity.stopAnimation();
        mapResultsOpacity.setValue(0);
        Animated.timing(mapResultsOpacity, {
          duration: 180,
          toValue: 1,
          useNativeDriver: true,
        }).start();
        return;
      }

      if (resultsChanged) {
        mapResultsOpacity.stopAnimation();
        Animated.sequence([
          Animated.timing(mapResultsOpacity, {
            duration: 90,
            toValue: 0.55,
            useNativeDriver: true,
          }),
          Animated.timing(mapResultsOpacity, {
            duration: 140,
            toValue: 1,
            useNativeDriver: true,
          }),
        ]).start();
      }
      return;
    }

    if (!showMapResultsCard) {
      return;
    }

    mapResultsOpacity.stopAnimation();
    Animated.timing(mapResultsOpacity, {
      duration: 160,
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setShowMapResultsCard(false);
      setRenderedMapSearchResults([]);
      setRenderedMapResultsKey('');
      setRenderedMapResultCount(0);
    });
  }, [
    filteredPlaces.length,
    mapResultsOpacity,
    mapSearchResults,
    mapSearchResultsKey,
    renderedMapResultCount,
    renderedMapResultsKey,
    shouldShowMapResults,
    showMapResultsCard,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function loadPlaces() {
      setListLoading(true);
      setErrorMessage(null);

      try {
        const nextPlaces = await fetchPlaces(apiBaseUrl, selectedCity);
        if (!isMounted) {
          return;
        }

        setPlaces(nextPlaces);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
        setPlaces([]);
      } finally {
        if (isMounted) {
          setListLoading(false);
        }
      }
    }

    void loadPlaces();

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, reloadCount, selectedCity]);

  useEffect(() => {
    if (!selectedPlaceSlug) {
      setSelectedPlace(null);
      return;
    }

    const placeSlug = selectedPlaceSlug;

    let isMounted = true;

    async function loadPlaceDetail() {
      setDetailLoading(true);
      setErrorMessage(null);

      try {
        const detail = await fetchPlaceDetail(apiBaseUrl, placeSlug);
        if (!isMounted) {
          return;
        }

        setSelectedPlace(detail);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
      } finally {
        if (isMounted) {
          setDetailLoading(false);
        }
      }
    }

    void loadPlaceDetail();

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, reloadCount, selectedPlaceSlug]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      animateNextLayout();
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      animateNextLayout();
      setKeyboardHeight(0);
    });

  return () => {
    showSubscription.remove();
    hideSubscription.remove();
  };
  }, []);

  useEffect(() => {
    if (!showMapBrowse || listLoading) {
      return;
    }

    const nextRegion = getBrowseMapRegion(selectedCity, mappedPlaces);
    setMapRegion((currentRegion) => {
      const boundedRegion = clampRegionToBounds(nextRegion);
      if (areRegionsEqual(currentRegion, boundedRegion)) {
        return currentRegion;
      }

      if (mapRef.current) {
        mapRef.current.animateToRegion(boundedRegion, 250);
      }

      return boundedRegion;
    });
  }, [filteredPlaceKey, listLoading, selectedCity, showMapBrowse]);

  useEffect(() => {
    if (!showMapBrowse || !shouldUseNativeMapBoundaries || !mapRef.current) {
      return;
    }

    mapRef.current.setMapBoundaries(
      { latitude: mapAreaBounds.maxLatitude, longitude: mapAreaBounds.maxLongitude },
      { latitude: mapAreaBounds.minLatitude, longitude: mapAreaBounds.minLongitude },
    );
  }, [shouldUseNativeMapBoundaries, showMapBrowse]);

  useEffect(() => {
    if (!selectedPlace) {
      return;
    }

    const nextLocation = getSelectedPlaceLocation(selectedPlace, selectedLocationId, selectedCity);
    if (nextLocation && nextLocation.id !== selectedLocationId) {
      setSelectedLocationId(nextLocation.id);
    }
  }, [selectedCity, selectedPlace]);

  useEffect(() => {
    if (!showMapBrowse || !selectedMapPlaceKey) {
      if (!showMapBrowse && selectedMapPlaceKey !== null) {
        setSelectedMapPlaceKey(null);
      }
      return;
    }

    if (!mappedPlaces.some((place) => place.markerKey === selectedMapPlaceKey)) {
      setSelectedMapPlaceKey(null);
    }
  }, [mappedPlaces, selectedMapPlaceKey, showMapBrowse]);

  function applyBaseUrl() {
    animateNextLayout();
    setErrorMessage(null);
    setBrowseFiltersExpanded(false);
    setSelectedMapPlaceKey(null);
    setSelectedPlaceSlug(null);
    setSelectedPlace(null);
    setSelectedLocationId(null);
    setApiBaseUrl(getDefaultApiBaseUrl());
    setReloadCount((current) => current + 1);
    setMapRegion(clampRegionToBounds(defaultMapRegion));
  }

  function handleSelectPlace(place: { slug: string; locationId?: number }) {
    animateNextLayout();
    startTransition(() => {
      setBrowseFiltersExpanded(false);
      setSelectedMapPlaceKey(null);
      setSelectedPlaceSlug(place.slug);
      setSelectedPlace(null);
      setSelectedLocationId(place.locationId ?? null);
    });
  }

  function handleToggleVenueType(venueType: VenueFilterValue) {
    setSelectedVenueTypes((current) => {
      const next = current.includes(venueType)
        ? current.filter((value) => value !== venueType)
        : [...current, venueType];

      return next.length ? next : [venueType];
    });
  }

  function handleSelectAllVenueTypes() {
    animateNextLayout();
    setSelectedVenueTypes(venueFilters.map((filter) => filter.value));
  }

  function handleBrowseModeChange(mode: BrowseMode) {
    if (mode === browseMode) {
      return;
    }

    animateNextLayout();
    setBrowseFiltersExpanded(false);
    setSelectedMapPlaceKey(null);
    setBrowseMode(mode);
  }

  function handleToggleBrowseFilters() {
    animateNextLayout();
    setBrowseFiltersExpanded((current) => !current);
  }

  function handleClearSearchQuery() {
    animateNextLayout();
    setSearchQuery('');
    setSelectedMapPlaceKey(null);
  }

  function handleBackToBrowse() {
    animateNextLayout();
    Keyboard.dismiss();
    setSelectedPlaceSlug(null);
  }

  function handleClearMapSelection() {
    animateNextLayout();
    setSelectedMapPlaceKey(null);
  }

  function handleFocusMapResult(place: MappedPlace) {
    animateNextLayout();
    setSelectedMapPlaceKey(place.markerKey);
    const nextRegion = clampRegionToBounds({
      latitude: place.latitude,
      longitude: place.longitude,
      latitudeDelta: Math.min(mapRegion.latitudeDelta, 0.04),
      longitudeDelta: Math.min(mapRegion.longitudeDelta, 0.04),
    });

    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 250);
  }

  return (
    <>
      <StatusBar backgroundColor="transparent" style="dark" translucent={showMapBrowse} />
      {selectedPlaceSlug ? (
        <Animated.View style={[styles.screenTransitionLayer, screenTransitionStyle]}>
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <View style={[styles.detailScreen, isLandscape ? styles.detailScreenLandscape : null]}>
          <ScrollView
            contentContainerStyle={[styles.detailScrollContent, isLandscape ? styles.detailScrollContentLandscape : null]}
            showsVerticalScrollIndicator={false}
          >
            <Pressable onPress={handleBackToBrowse} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back to places</Text>
            </Pressable>

            {detailLoading && !selectedPlace ? (
              <View style={styles.centerState}>
                <ActivityIndicator color="#c65d1f" size="large" />
                <Text style={styles.centerStateText}>Loading place details...</Text>
              </View>
            ) : null}

            {selectedPlace ? (
              <View style={[styles.detailCard, isLandscape ? styles.detailCardLandscape : null]}>
                <Text style={styles.detailCity}>{selectedPlaceLocation?.city_label ?? selectedPlace.city_label}</Text>
                <Text style={styles.detailTitle}>{selectedPlace.name}</Text>
                <Text style={styles.detailMeta}>{selectedPlace.venue_type_label}</Text>
                {selectedPlace.locations.length ? (
                  <>
                    <Text style={[styles.sectionTitle, styles.locationsSectionTitle]}>
                      {selectedPlace.locations.length === 1 ? 'Location' : 'Locations'}
                    </Text>
                    <View style={styles.filterRow}>
                      {selectedPlace.locations.map((location) => {
                        const isActive = location.id === selectedPlaceLocation?.id;

                        return (
                          <Pressable
                            key={location.id}
                            onPress={() => setSelectedLocationId(location.id)}
                            style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                          >
                            <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                              {location.city_label} - {location.address_line_1}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
                <Pressable onPress={() => void openMapsAddress(selectedPlaceLocation ?? selectedPlace)} style={styles.addressButton}>
                  <Text selectable style={styles.detailLinkText}>{formatPlaceAddress(selectedPlaceLocation ?? selectedPlace)}</Text>
                </Pressable>

                {(selectedPlaceLocation?.phone_number ?? selectedPlace.phone_number) ? (
                  <Text selectable style={styles.detailMeta}>Phone: {selectedPlaceLocation?.phone_number ?? selectedPlace.phone_number}</Text>
                ) : null}

                {selectedPlaceMapRegion ? (
                  <Pressable
                    onPress={() => void openMapsAddress(selectedPlaceLocation ?? selectedPlace)}
                    style={styles.detailMapCard}
                  >
                    <MapView
                      region={selectedPlaceMapRegion}
                      pointerEvents="none"
                      rotateEnabled={false}
                      scrollEnabled={false}
                      style={styles.detailMap}
                      zoomEnabled={false}
                    >
                      <Marker
                        coordinate={{
                          latitude: selectedPlaceMapRegion.latitude,
                          longitude: selectedPlaceMapRegion.longitude,
                        }}
                      />
                    </MapView>
                    <View style={styles.detailMapCaption}>
                      <Text style={styles.detailMapCaptionText}>Tap to open in Maps</Text>
                    </View>
                  </Pressable>
                ) : null}

                {(selectedPlaceLocation?.website_url ?? selectedPlace.website_url) ? (
                  <Pressable onPress={() => void Linking.openURL(selectedPlaceLocation?.website_url ?? selectedPlace.website_url)} style={styles.linkButton}>
                    <Text style={styles.linkButtonText}>Open website</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => void Linking.openURL(buildGoogleReviewsUrl(selectedPlaceLocation ?? selectedPlace))}
                  style={styles.linkButtonSecondary}
                >
                  <Text style={styles.linkButtonSecondaryText}>View Google Reviews</Text>
                </Pressable>

                {selectedPlaceOperatingHours.length ? (
          <>
            <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Hours of Operations</Text>
            <View style={styles.hourList}>
              {formatOperatingHourGroups(selectedPlaceOperatingHours).map((group) => (
                <View key={group.id} style={styles.hourGroupCard}>
                  <Text style={styles.hourGroupDays}>{group.dayLabel}</Text>
                  <Text style={styles.hourRow}>{group.timeLabel}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Current Deals</Text>

                {selectedPlaceDeals.length ? (
                  selectedPlaceDeals.map((deal) => (
                    <View key={deal.id} style={styles.dealCard}>
                      <View style={styles.dealHeaderRow}>
                        <Text style={styles.dealTitle}>{deal.title}</Text>
                        <View style={styles.pill}>
                          <Text style={styles.pillText}>{deal.deal_type_label}</Text>
                        </View>
                      </View>
                      {deal.price_text ? <Text style={styles.dealPrice}>{deal.price_text}</Text> : null}
                      {deal.description ? <Text style={styles.dealDescription}>{deal.description}</Text> : null}
                      {deal.terms ? <Text style={styles.dealTerms}>Terms: {deal.terms}</Text> : null}
                      <View style={styles.hourList}>
                        {formatHappyHourGroups(deal.happy_hours, selectedPlaceOperatingHours).map((group) => (
                          <View key={group.id} style={styles.hourGroupCard}>
                            <Text style={styles.hourGroupDays}>{group.dayLabel}</Text>
                            <Text style={styles.hourRow}>{group.timeLabel}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyStateText}>No active deals were returned for this place yet.</Text>
                )}
              </View>
            ) : null}
          </ScrollView>
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </View>
        </SafeAreaView>
        </Animated.View>
      ) : showMapBrowse ? (
        <Animated.View style={[styles.screenTransitionLayer, styles.fullScreenRoot, screenTransitionStyle]}>
        <View style={styles.fullScreenRoot}>
        <View style={styles.mapScreen}>
          <MapView
            initialRegion={mapRegion}
            maxDelta={maxLatitudeDelta}
            minDelta={minLatitudeDelta}
            onMapReady={() => {
              if (!shouldUseNativeMapBoundaries || !mapRef.current) {
                return;
              }

              mapRef.current.setMapBoundaries(
                { latitude: mapAreaBounds.maxLatitude, longitude: mapAreaBounds.maxLongitude },
                { latitude: mapAreaBounds.minLatitude, longitude: mapAreaBounds.minLongitude },
              );
              mapRef.current.animateToRegion(mapRegion, 0);
            }}
            onRegionChangeComplete={(nextRegion) => {
              const normalizedRegion = normalizeRegion(nextRegion);
              const boundedRegion = clampRegionToBounds(nextRegion);

              if (mapRef.current && !areRegionsEqual(normalizedRegion, boundedRegion)) {
                mapRef.current.animateToRegion(boundedRegion, 150);
              }

              setMapRegion((currentRegion) => (
                areRegionsEqual(currentRegion, boundedRegion) ? currentRegion : boundedRegion
              ));
            }}
            onPress={(event) => {
              Keyboard.dismiss();
              if (event.nativeEvent.action === 'marker-press') {
                return;
              }

              handleClearMapSelection();
            }}
            ref={mapRef}
            style={styles.mapBackground}
          >
            {mappedPlaces.map((place, index) => {
              const markerStyle = getVenueMarkerStyle(place.venue_type);

              return (
              <Marker
                anchor={{ x: 0.5, y: 0.5 }}
                coordinate={{ latitude: place.markerLatitude, longitude: place.markerLongitude }}
                key={place.markerKey}
                onPress={() => {
                  animateNextLayout();
                  setSelectedMapPlaceKey(place.markerKey);
                }}
                tracksViewChanges={false}
                zIndex={mappedPlaces.length - index}
              >
                <View style={[
                  styles.mapMarker,
                  { backgroundColor: markerStyle.fill, borderColor: markerStyle.stroke },
                  selectedMapPlaceKey === place.markerKey ? styles.mapMarkerActive : null,
                ]}>
                  <Text style={styles.mapMarkerText}>{markerStyle.badge}</Text>
                </View>
              </Marker>
              );
            })}
          </MapView>

            <View
              pointerEvents="box-none"
              style={[
                styles.mapOverlayLayer,
                {
                  paddingTop: Math.max(insets.top + 12, 24),
                  paddingBottom: mapOverlayBottomPadding,
                },
              ]}
            >
            <BrowseControls
              overlay
              browseMode={browseMode}
              filtersExpanded={browseFiltersExpanded}
              onBrowseModeChange={handleBrowseModeChange}
              onChangeSearchQuery={setSearchQuery}
              onClearSearchQuery={handleClearSearchQuery}
              onReload={applyBaseUrl}
              onSelectAllVenueTypes={handleSelectAllVenueTypes}
              onSelectCity={setSelectedCity}
              onToggleFilters={handleToggleBrowseFilters}
              onToggleVenueType={handleToggleVenueType}
              resultCount={filteredPlaces.length}
              searchQuery={searchQuery}
              selectedCity={selectedCity}
              selectedVenueTypes={selectedVenueTypes}
            />

            {listLoading ? (
              <View style={styles.mapLoadingOverlay}>
                <ActivityIndicator color="#c65d1f" size="large" />
                <Text style={styles.mapOverlayText}>Loading places...</Text>
              </View>
            ) : null}

            {selectedMapPlace ? (
              <View style={styles.mapPreviewCard}>
                <View style={styles.mapPreviewHeader}>
                  <View style={styles.mapPreviewCopy}>
                    <Text style={styles.mapPreviewTitle}>{selectedMapPlace.name}</Text>
                    <Text style={styles.mapPreviewMeta}>{selectedMapPlace.venue_type_label}</Text>
                  </View>
                  <View style={styles.mapPreviewActions}>
                    <Pressable onPress={handleClearMapSelection} style={styles.mapPreviewIconButton}>
                      <Text style={styles.mapPreviewIconText}>×</Text>
                    </Pressable>
                    <Pressable onPress={() => handleSelectPlace(selectedMapPlace)} style={styles.mapPreviewIconButton}>
                      <Text style={styles.mapPreviewIconText}>↗</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.mapPreviewDetails}>
                  <Text style={styles.mapPreviewDetailText}>{selectedMapPlace.fullAddress}</Text>
                  {selectedMapPlace.phone_number ? (
                    <Text style={styles.mapPreviewDetailText}>{selectedMapPlace.phone_number}</Text>
                  ) : null}
                </View>

                {selectedMapImageUrls.length ? (
                  <ScrollView
                    contentContainerStyle={styles.mapPreviewGallery}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                  >
                    {selectedMapImageUrls.map((imageUrl) => (
                      <Image
                        key={imageUrl}
                        source={{ uri: imageUrl }}
                        style={styles.mapPreviewImage}
                      />
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.mapPreviewEmptyState}>
                    <Text style={styles.mapPreviewEmptyText}>Photos from this business page have not been found yet.</Text>
                  </View>
                )}
              </View>
            ) : showMapResultsCard ? (
              <Animated.View style={[styles.mapResultsCard, { opacity: mapResultsOpacity }]}>
                <View style={styles.mapResultsHeader}>
                  <Text style={styles.mapResultsTitle}>Best matches</Text>
                  <Text style={styles.mapResultsMeta}>{renderedMapResultCount} in view</Text>
                </View>
                {renderedMapSearchResults.length ? (
                  <View style={styles.mapResultsList}>
                    {renderedMapSearchResults.map((place) => (
                      <Pressable
                        key={place.markerKey}
                        onPress={() => handleFocusMapResult(place)}
                        style={styles.mapResultRow}
                      >
                        <View style={styles.mapResultCopy}>
                          <Text numberOfLines={1} style={styles.mapResultTitle}>{place.name}</Text>
                          <Text numberOfLines={2} style={styles.mapResultMeta}>
                            {place.venue_type_label} • {place.fullAddress}
                          </Text>
                        </View>
                        <Text style={styles.mapResultAction}>Focus</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.mapResultEmptyText}>No map matches found for that search yet.</Text>
                )}
              </Animated.View>
            ) : null}

            {errorMessage ? (
              <View style={[styles.errorBanner, styles.mapErrorBanner]}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </View>
        </View>
        </View>
        </Animated.View>
      ) : (
        <Animated.View style={[styles.screenTransitionLayer, screenTransitionStyle]}>
        <SafeAreaView style={styles.safeArea}>
        <View style={[styles.screen, isLandscape ? styles.screenLandscape : null]}>
          <>
            <BrowseControls
              browseMode={browseMode}
              filtersExpanded={browseFiltersExpanded}
              onBrowseModeChange={handleBrowseModeChange}
              onChangeSearchQuery={setSearchQuery}
              onClearSearchQuery={handleClearSearchQuery}
              onReload={applyBaseUrl}
              onSelectAllVenueTypes={handleSelectAllVenueTypes}
              onSelectCity={setSelectedCity}
              onToggleFilters={handleToggleBrowseFilters}
              onToggleVenueType={handleToggleVenueType}
              resultCount={filteredPlaces.length}
              searchQuery={searchQuery}
              selectedCity={selectedCity}
              selectedVenueTypes={selectedVenueTypes}
            />

            {listLoading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color="#c65d1f" size="large" />
                <Text style={styles.centerStateText}>Loading places...</Text>
              </View>
            ) : (
              <FlatList
                columnWrapperStyle={browseListColumns > 1 ? styles.placeCardColumn : undefined}
                contentContainerStyle={[styles.listContent, browseListColumns > 1 ? styles.listContentLandscape : null]}
                data={filteredPlaces}
                keyExtractor={(item) => item.id.toString()}
                key={browseListColumns}
                numColumns={browseListColumns}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelectPlace(item)}
                    style={[styles.placeCard, browseListColumns > 1 ? styles.placeCardLandscape : null]}
                  >
                    <Text style={styles.placeCity}>{getPlaceCardEyebrow(item)}</Text>
                    <Text style={styles.placeTitle}>{item.name}</Text>
                    <Text style={styles.placeMeta}>{item.venue_type_label}</Text>
                    <Text style={styles.placeAddress}>{getPlaceCardAddress(item)}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={<Text style={styles.emptyStateText}>{getBrowseEmptyStateMessage(normalizedSearchQuery)}</Text>}
                showsVerticalScrollIndicator={false}
              />
            )}
          </>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </View>
        </SafeAreaView>
        </Animated.View>
      )}
    </>
  );
}

function BrowseControls({
  overlay = false,
  browseMode,
  filtersExpanded,
  onBrowseModeChange,
  onChangeSearchQuery,
  onClearSearchQuery,
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
  const chipStyle = overlay ? styles.overlayChip : styles.filterChip;
  const chipActiveStyle = overlay ? styles.overlayChipActive : styles.filterChipActive;
  const chipTextStyle = overlay ? styles.overlayChipText : styles.filterChipText;
  const chipTextActiveStyle = overlay ? styles.overlayChipTextActive : styles.filterChipTextActive;

  return (
    <View style={overlay ? styles.mapTopPanel : styles.browseHeaderCard}>
      <View style={styles.toolbarRow}>
        <Text style={overlay ? styles.mapAppTitle : styles.appTitle}>HappyHourApp</Text>
        <Pressable onPress={onReload} style={styles.reloadButton}>
          <Text style={styles.reloadButtonText}>Reload</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.searchInputShell, overlay ? styles.searchInputShellOverlay : null]}>
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
          style={[styles.filtersToggleButton, filtersExpanded ? styles.filtersToggleButtonActive : null]}
        >
          <Text style={[styles.filtersToggleText, filtersExpanded ? styles.filtersToggleTextActive : null]}>
            {filtersExpanded ? 'Hide filters' : 'Filters'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.browseStatsRow}>
        <Text style={styles.browseStatsText}>{resultCount} {resultCount === 1 ? 'place' : 'places'}</Text>
        <Text numberOfLines={1} style={styles.browseStatsSubtleText}>
          {getBrowseSummaryLabel(selectedCity, selectedVenueTypes, normalizeSearchText(searchQuery))}
        </Text>
      </View>

      {filtersExpanded ? (
        <View style={styles.filtersPanel}>
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

          <View style={styles.browseSectionHeaderRow}>
            <Text style={styles.browseSectionTitle}>Venue type</Text>
            <Pressable onPress={onSelectAllVenueTypes}>
              <Text style={styles.browseSectionAction}>Reset</Text>
            </Pressable>
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

          <View style={styles.modeRow}>
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
      ) : null}
    </View>
  );
}

function formatTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return value;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function isCloseLabel(endTime: string, weekdays: number[], operatingHours: OperatingHourWindow[]) {
  if (endTime === '23:59') {
    return true;
  }

  if (!operatingHours.length) {
    return false;
  }

  const closeTimesByWeekday = new Map<number, string>(
    operatingHours.map((operatingHour) => [operatingHour.weekday, operatingHour.close_time]),
  );

  return weekdays.every((weekday) => closeTimesByWeekday.get(weekday) === endTime);
}

function formatHappyHourGroups(happyHours: HappyHourWindow[], operatingHours: OperatingHourWindow[] = []) {
  const groupedHours = new Map<string, HappyHourWindow[]>();

  happyHours.forEach((happyHour) => {
    const key = `${happyHour.start_time}-${happyHour.end_time}-${happyHour.all_day}`;
    const existingGroup = groupedHours.get(key);

    if (existingGroup) {
      existingGroup.push(happyHour);
      return;
    }

    groupedHours.set(key, [happyHour]);
  });

  return Array.from(groupedHours.entries()).map(([key, group]) => {
    const weekdays = group.map((happyHour) => happyHour.weekday);
    const endLabel = isCloseLabel(group[0].end_time, weekdays, operatingHours)
      ? 'Close'
      : formatTime(group[0].end_time);

    return {
      id: key,
      dayLabel: formatWeekdayRanges(weekdays),
      timeLabel: group[0].all_day
        ? 'All day'
        : `${formatTime(group[0].start_time)} - ${endLabel}`,
    };
  });
}

function formatOperatingHourGroups(operatingHours: OperatingHourWindow[]) {
  const groupedHours = new Map<string, OperatingHourWindow[]>();

  operatingHours.forEach((operatingHour) => {
    const key = `${operatingHour.open_time}-${operatingHour.close_time}`;
    const existingGroup = groupedHours.get(key);

    if (existingGroup) {
      existingGroup.push(operatingHour);
      return;
    }

    groupedHours.set(key, [operatingHour]);
  });

  return Array.from(groupedHours.entries()).map(([key, group]) => ({
    id: key,
    dayLabel: formatWeekdayRanges(group.map((operatingHour) => operatingHour.weekday)),
    timeLabel: `${formatTime(group[0].open_time)} - ${formatTime(group[0].close_time)}`,
  }));
}

function formatWeekdayRanges(weekdayValues: number[]) {
  const orderedDays = Array.from(new Set(weekdayValues));

  if (!orderedDays.length) {
    return '';
  }

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const segments: string[] = [];
  let rangeStart = orderedDays[0];
  let previousDay = orderedDays[0];

  for (let index = 1; index < orderedDays.length; index += 1) {
    const day = orderedDays[index];
    if (day === ((previousDay + 1) % dayLabels.length)) {
      previousDay = day;
      continue;
    }

    segments.push(formatWeekdaySegment(rangeStart, previousDay, dayLabels));
    rangeStart = day;
    previousDay = day;
  }

  segments.push(formatWeekdaySegment(rangeStart, previousDay, dayLabels));
  return segments.join(', ');
}

function formatWeekdaySegment(startDay: number, endDay: number, dayLabels: string[]) {
  const startLabel = dayLabels[startDay] ?? '';
  const endLabel = dayLabels[endDay] ?? '';

  if (startDay === endDay) {
    return startLabel;
  }

  return `${startLabel}-${endLabel}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while talking to the backend.';
}

function formatPlaceAddress(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const lineOne = place.address_line_1;
  const lineTwo = place.address_line_2 ? `, ${place.address_line_2}` : '';
  return `${lineOne}${lineTwo}, ${place.city_label}, ${place.state} ${place.postal_code}`;
}

function dedupeImageUrls(imageUrls: string[]) {
  return Array.from(new Set(imageUrls.filter((imageUrl) => imageUrl.trim().length > 0)));
}

function getPlaceCardEyebrow(place: PlaceListItem) {
  const cityLabels = Array.from(new Set(getPlaceLocations(place).map((location) => location.city_label)));
  return cityLabels.join(' • ');
}

function getPlaceCardAddress(place: PlaceListItem) {
  const locations = getPlaceLocations(place);
  if (locations.length > 1) {
    return `${locations.length} locations`;
  }

  return formatPlaceAddress(locations[0] ?? place);
}

function getPlacePreviewRegion(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail | null) {
  if (!place || place.latitude === null || place.longitude === null) {
    return null;
  }

  return {
    latitude: place.latitude,
    longitude: place.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };
}

async function openMapsAddress(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const query = encodeURIComponent(formatPlaceAddress(place));
  await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
}

function buildGoogleReviewsUrl(place: PlaceListItem | PlaceDetail | PlaceLocation | PlaceLocationDetail) {
  const query = encodeURIComponent(`${place.name} ${formatPlaceAddress(place)}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function getPlaceLocations(place: PlaceListItem | PlaceDetail) {
  return place.locations.length ? place.locations : [place];
}

function getSelectedPlaceLocation(
  place: PlaceDetail | null,
  preferredLocationId: number | null,
  selectedCity: CityFilterValue,
): PlaceDetail | PlaceLocationDetail | null {
  if (!place) {
    return null;
  }

  const locations = place.locations.length ? place.locations : [place];

  if (!locations.length) {
    return null;
  }

  if (preferredLocationId !== null) {
    const preferredLocation = locations.find((location) => location.id === preferredLocationId);
    if (preferredLocation) {
      return preferredLocation;
    }
  }

  if (selectedCity !== 'all') {
    const matchingCityLocation = locations.find((location) => location.city === selectedCity);
    if (matchingCityLocation) {
      return matchingCityLocation;
    }
  }

  return locations[0] ?? null;
}

function getBrowseMapRegion(selectedCity: CityFilterValue, mappedPlaces: MappedPlace[]) {
  if (selectedCity !== 'all') {
    return clampRegionToBounds(cityMapRegions[selectedCity]);
  }

  return getMapRegion(mappedPlaces);
}

function getFilteredPlaces(places: PlaceListItem[], selectedVenueTypes: VenueFilterValue[], searchQuery: string) {
  return places
    .map((place, index) => ({
      index,
      place,
      score: getPlaceSearchScore(place, searchQuery),
    }))
    .filter(({ place, score }) => (
      selectedVenueTypes.includes(place.venue_type as VenueFilterValue) && (searchQuery.length === 0 || score > 0)
    ))
    .sort((first, second) => {
      if (searchQuery.length === 0) {
        return first.index - second.index;
      }

      return second.score - first.score || first.place.name.localeCompare(second.place.name);
    })
    .map(({ place }) => place);
}

function getPlaceSearchScore(place: PlaceListItem, searchQuery: string) {
  if (!searchQuery.length) {
    return 1;
  }

  const searchableFields = getPlaceSearchFields(place);
  const tokens = searchQuery.split(' ').filter(Boolean);
  let totalScore = 0;

  for (const token of tokens) {
    let bestTokenScore = 0;

    searchableFields.forEach(({ value, weight }) => {
      const tokenScore = getTokenMatchScore(value, token) * weight;
      if (tokenScore > bestTokenScore) {
        bestTokenScore = tokenScore;
      }
    });

    if (!bestTokenScore) {
      return 0;
    }

    totalScore += bestTokenScore;
  }

  if (searchableFields.some(({ value }) => value.includes(searchQuery))) {
    totalScore += 30;
  }

  return totalScore;
}

function getPlaceSearchFields(place: PlaceListItem) {
  return [
    { value: normalizeSearchText(place.name), weight: 12 },
    { value: normalizeSearchText(place.venue_type_label), weight: 5 },
    ...getPlaceLocations(place).flatMap((location) => [
      { value: normalizeSearchText(location.city_label), weight: 6 },
      { value: normalizeSearchText(location.neighborhood), weight: 7 },
      { value: normalizeSearchText(location.address_line_1), weight: 8 },
      { value: normalizeSearchText(location.address_line_2), weight: 3 },
      { value: normalizeSearchText(formatPlaceAddress(location)), weight: 9 },
      { value: normalizeSearchText(location.postal_code), weight: 2 },
    ]),
  ];
}

function getTokenMatchScore(fieldValue: string, token: string) {
  if (!fieldValue.length || !token.length) {
    return 0;
  }

  if (fieldValue === token) {
    return 18;
  }

  if (fieldValue.startsWith(token)) {
    return 14;
  }

  if (fieldValue.split(' ').some((word) => word.startsWith(token))) {
    return 10;
  }

  if (fieldValue.includes(token)) {
    return 6;
  }

  return 0;
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getBrowseSummaryLabel(selectedCity: CityFilterValue, selectedVenueTypes: VenueFilterValue[], searchQuery: string) {
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

function getBrowseEmptyStateMessage(searchQuery: string) {
  if (searchQuery.length) {
    return 'No places matched that search and filter combination yet.';
  }

  return 'No places matched the current filters yet.';
}

function getMapRegion(mappedPlaces: MappedPlace[]) {
  if (!mappedPlaces.length) {
    return clampRegionToBounds(defaultMapRegion);
  }

  const latitudes = mappedPlaces.map((place) => place.latitude);
  const longitudes = mappedPlaces.map((place) => place.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return clampRegionToBounds({
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * mapFitPaddingFactor, minLatitudeDelta),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * mapFitPaddingFactor, minLongitudeDelta),
  });
}

function getDisplayMarkerCoordinates(mappedPlaces: MappedPlace[], region: Region) {
  const clusteredPlaces = [...mappedPlaces];
  const visitedIndices = new Set<number>();
  const dispersionProgress = getMarkerDispersionProgress(region);

  for (let index = 0; index < clusteredPlaces.length; index += 1) {
    if (visitedIndices.has(index)) {
      continue;
    }

    const clusterIndices = [index];
    visitedIndices.add(index);

    for (let clusterScanIndex = 0; clusterScanIndex < clusterIndices.length; clusterScanIndex += 1) {
      const clusterIndex = clusterIndices[clusterScanIndex];

      for (let compareIndex = index + 1; compareIndex < clusteredPlaces.length; compareIndex += 1) {
        if (visitedIndices.has(compareIndex)) {
          continue;
        }

        if (getCoordinateDistance(clusteredPlaces[clusterIndex], clusteredPlaces[compareIndex]) <= markerClusterThreshold) {
          clusterIndices.push(compareIndex);
          visitedIndices.add(compareIndex);
        }
      }
    }

    if (clusterIndices.length === 1) {
      continue;
    }

    const clusterPlaces = clusterIndices
      .map((clusterIndex) => clusteredPlaces[clusterIndex])
      .sort((first, second) => first.name.localeCompare(second.name));
    const clusterCenterLatitude = clusterPlaces.reduce((sum, place) => sum + place.latitude, 0) / clusterPlaces.length;
    const clusterCenterLongitude = clusterPlaces.reduce((sum, place) => sum + place.longitude, 0) / clusterPlaces.length;
    const visibleClusterRadius = interpolate(markerClusterRadius, markerMinimumVisibleRadius, dispersionProgress);

    clusterPlaces.forEach((place, clusterPosition) => {
      const { angle, radius } = getClusterMarkerOffset(clusterPlaces.length, clusterPosition, visibleClusterRadius);
      const baseLatitude = interpolate(clusterCenterLatitude, place.latitude, dispersionProgress);
      const baseLongitude = interpolate(clusterCenterLongitude, place.longitude, dispersionProgress);

      place.markerLatitude = clamp(
        baseLatitude + Math.sin(angle) * radius,
        mapAreaBounds.minLatitude,
        mapAreaBounds.maxLatitude,
      );
      place.markerLongitude = clamp(
        baseLongitude + Math.cos(angle) * radius,
        mapAreaBounds.minLongitude,
        mapAreaBounds.maxLongitude,
      );
    });
  }

  return clusteredPlaces;
}

function getClusterMarkerOffset(clusterSize: number, clusterPosition: number, baseRadius: number) {
  let remainingPosition = clusterPosition;
  let ring = 0;

  while (true) {
    const markersInRing = getMarkersInRing(clusterSize, ring);
    if (remainingPosition < markersInRing) {
      const angleOffset = ring % 2 === 0 ? 0 : Math.PI / markersInRing;
      return {
        angle: angleOffset + ((Math.PI * 2 * remainingPosition) / markersInRing),
        radius: baseRadius + (ring * markerClusterRingSpacing),
      };
    }

    remainingPosition -= markersInRing;
    ring += 1;
  }
}

function getMarkersInRing(clusterSize: number, ring: number) {
  if (clusterSize <= 6) {
    return clusterSize;
  }

  return 6 + (ring * 4);
}

function getMarkerDispersionProgress(region: Region) {
  const normalizedZoom = 1 - ((region.longitudeDelta - minLongitudeDelta) / (maxLongitudeDelta - minLongitudeDelta));
  return Math.pow(clamp(normalizedZoom, 0, 1), 1.35);
}

function getCoordinateDistance(first: MappedPlace, second: MappedPlace) {
  return Math.hypot(first.latitude - second.latitude, first.longitude - second.longitude);
}

function interpolate(start: number, end: number, progress: number) {
  return start + ((end - start) * progress);
}

function normalizeRegion(region: Region): Region {
  const latitudeDelta = clamp(region.latitudeDelta, minLatitudeDelta, maxLatitudeDelta);
  const longitudeDelta = clamp(region.longitudeDelta, minLongitudeDelta, maxLongitudeDelta);

  return {
    latitude: region.latitude,
    longitude: region.longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

function clampRegionToBounds(region: Region): Region {
  const normalizedRegion = normalizeRegion(region);
  const latitudePadding = normalizedRegion.latitudeDelta / 2;
  const longitudePadding = normalizedRegion.longitudeDelta / 2;
  const minLatitude = mapAreaBounds.minLatitude + latitudePadding;
  const maxLatitude = mapAreaBounds.maxLatitude - latitudePadding;
  const minLongitude = mapAreaBounds.minLongitude + longitudePadding;
  const maxLongitude = mapAreaBounds.maxLongitude - longitudePadding;

  return {
    latitude: clamp(normalizedRegion.latitude, minLatitude, maxLatitude),
    longitude: clamp(normalizedRegion.longitude, minLongitude, maxLongitude),
    latitudeDelta: normalizedRegion.latitudeDelta,
    longitudeDelta: normalizedRegion.longitudeDelta,
  };
}

function areRegionsEqual(first: Region, second: Region) {
  return (
    nearlyEqual(first.latitude, second.latitude) &&
    nearlyEqual(first.longitude, second.longitude) &&
    nearlyEqual(first.latitudeDelta, second.latitudeDelta) &&
    nearlyEqual(first.longitudeDelta, second.longitudeDelta)
  );
}

function nearlyEqual(first: number, second: number) {
  return Math.abs(first - second) < 0.0001;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getVenueMarkerStyle(venueType: string) {
  return venueMarkerStyles[venueType as keyof typeof venueMarkerStyles] ?? venueMarkerStyles.other;
}

const styles = StyleSheet.create({
  fullScreenRoot: {
    flex: 1,
    backgroundColor: '#f7efe2',
  },
  screenTransitionLayer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#f7efe2',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 14,
  },
  screenLandscape: {
    alignSelf: 'center',
    maxWidth: 1180,
    width: '100%',
  },
  detailScreen: {
    flex: 1,
    paddingHorizontal: 18,
  },
  detailScreenLandscape: {
    alignSelf: 'center',
    maxWidth: 1180,
    width: '100%',
  },
  browseHeaderCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  toolbarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  appTitle: {
    color: '#2d221a',
    fontSize: 24,
    fontWeight: '800',
  },
  mapScreen: {
    flex: 1,
  },
  mapBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 0,
  },
  mapTopPanel: {
    backgroundColor: 'rgba(247, 239, 226, 0.92)',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  mapLoadingOverlay: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 250, 244, 0.94)',
    borderRadius: 20,
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  mapPreviewCard: {
    backgroundColor: 'rgba(255, 250, 244, 0.97)',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  mapResultsCard: {
    backgroundColor: 'rgba(255, 250, 244, 0.97)',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  mapResultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mapResultsTitle: {
    color: '#2d221a',
    fontSize: 18,
    fontWeight: '800',
  },
  mapResultsMeta: {
    color: '#7b6350',
    fontSize: 12,
    fontWeight: '700',
  },
  mapResultsList: {
    gap: 10,
  },
  mapResultRow: {
    alignItems: 'center',
    backgroundColor: '#fff7ef',
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mapResultCopy: {
    flex: 1,
    gap: 4,
  },
  mapResultTitle: {
    color: '#2d221a',
    fontSize: 15,
    fontWeight: '800',
  },
  mapResultMeta: {
    color: '#725947',
    fontSize: 12,
    lineHeight: 17,
  },
  mapResultAction: {
    color: '#1f5f5b',
    fontSize: 12,
    fontWeight: '800',
  },
  mapResultEmptyText: {
    color: '#725947',
    fontSize: 13,
    lineHeight: 18,
  },
  mapPreviewHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mapPreviewCopy: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  mapPreviewTitle: {
    color: '#2d221a',
    fontSize: 19,
    fontWeight: '800',
  },
  mapPreviewMeta: {
    color: '#6c5443',
    fontSize: 14,
    fontWeight: '600',
  },
  mapPreviewActions: {
    flexDirection: 'row',
    gap: 8,
  },
  mapPreviewDetails: {
    gap: 4,
    marginTop: -2,
  },
  mapPreviewDetailText: {
    color: '#725947',
    fontSize: 13,
    lineHeight: 18,
  },
  mapPreviewIconButton: {
    alignItems: 'center',
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  mapPreviewIconText: {
    color: '#402214',
    fontSize: 18,
    fontWeight: '800',
  },
  mapPreviewGallery: {
    gap: 12,
  },
  mapPreviewImage: {
    backgroundColor: '#ecdac7',
    borderRadius: 18,
    height: 180,
    width: 250,
  },
  mapPreviewEmptyState: {
    alignItems: 'center',
    backgroundColor: '#f6eee4',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 140,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  mapPreviewEmptyText: {
    color: '#7d614f',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  mapAppTitle: {
    color: '#2d221a',
    fontSize: 24,
    fontWeight: '800',
  },
  mapOverlayText: {
    color: '#6c5443',
    fontSize: 13,
    lineHeight: 18,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  searchInputShell: {
    alignItems: 'center',
    backgroundColor: '#f8efe3',
    borderColor: '#ead6bf',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  searchInputShellOverlay: {
    backgroundColor: 'rgba(248, 239, 227, 0.94)',
  },
  searchInputIcon: {
    color: '#9a6440',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  searchInput: {
    color: '#2d221a',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  searchClearButton: {
    paddingVertical: 6,
  },
  searchClearButtonText: {
    color: '#1f5f5b',
    fontSize: 13,
    fontWeight: '700',
  },
  filtersToggleButton: {
    alignItems: 'center',
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  filtersToggleButtonActive: {
    backgroundColor: '#402214',
    borderColor: '#402214',
  },
  filtersToggleText: {
    color: '#5d4637',
    fontSize: 13,
    fontWeight: '700',
  },
  filtersToggleTextActive: {
    color: '#fff7ef',
  },
  browseStatsRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  browseStatsText: {
    color: '#2d221a',
    fontSize: 14,
    fontWeight: '800',
  },
  browseStatsSubtleText: {
    color: '#7b6350',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  filtersPanel: {
    borderTopColor: '#efd8bd',
    borderTopWidth: 1,
    gap: 12,
    paddingTop: 12,
  },
  browseSectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  browseSectionTitle: {
    color: '#402214',
    fontSize: 14,
    fontWeight: '800',
  },
  browseSectionMeta: {
    color: '#8f725d',
    fontSize: 12,
    fontWeight: '600',
  },
  browseSectionAction: {
    color: '#1f5f5b',
    fontSize: 12,
    fontWeight: '700',
  },
  reloadButton: {
    backgroundColor: '#1f5f5b',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  reloadButtonText: {
    color: '#f4fffe',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#402214',
    fontSize: 18,
    fontWeight: '700',
  },
  detailSectionTitle: {
    marginTop: 22,
  },
  locationsSectionTitle: {
    paddingTop: 6,
    paddingBottom: 6,
  },
  filterRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modeButtonActive: {
    backgroundColor: '#1f5f5b',
    borderColor: '#1f5f5b',
  },
  modeButtonText: {
    color: '#5d4637',
    fontSize: 13,
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#f4fffe',
  },
  filterChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: '#402214',
    borderColor: '#402214',
  },
  filterChipText: {
    color: '#5d4637',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff7ef',
  },
  overlayChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 247, 239, 0.96)',
    borderColor: '#ddc4a7',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  overlayChipActive: {
    backgroundColor: '#402214',
    borderColor: '#402214',
  },
  overlayChipText: {
    color: '#5d4637',
    fontSize: 13,
    fontWeight: '600',
  },
  overlayChipTextActive: {
    color: '#fff7ef',
  },
  venueFilterRow: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 16,
  },
  venueFilterChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  venueFilterChipActive: {
    backgroundColor: '#402214',
    borderColor: '#402214',
  },
  venueFilterBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  venueFilterBadgeText: {
    color: '#fffaf4',
    fontSize: 11,
    fontWeight: '800',
  },
  mapMarker: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  mapMarkerActive: {
    transform: [{ scale: 1.18 }],
  },
  mapMarkerText: {
    color: '#fffaf4',
    fontSize: 12,
    fontWeight: '900',
  },
  listContent: {
    gap: 12,
    paddingBottom: 24,
  },
  listContentLandscape: {
    paddingBottom: 32,
  },
  placeCardColumn: {
    gap: 12,
  },
  placeCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd8bd',
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  placeCardLandscape: {
    flex: 1,
  },
  placeCity: {
    color: '#c65d1f',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  placeTitle: {
    color: '#2d221a',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  placeMeta: {
    color: '#5c5043',
    fontSize: 14,
    marginTop: 4,
  },
  placeAddress: {
    color: '#7d614f',
    fontSize: 13,
    marginTop: 8,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  centerStateText: {
    color: '#6f5947',
    marginTop: 10,
  },
  detailScrollContent: {
    paddingTop: 45,
    paddingBottom: 20,
  },
  detailScrollContentLandscape: {
    paddingTop: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ef',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#402214',
    fontWeight: '700',
  },
  detailCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd8bd',
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 12,
    padding: 18,
  },
  detailCardLandscape: {
    alignSelf: 'center',
    maxWidth: 980,
    width: '100%',
  },
  detailCity: {
    color: '#c65d1f',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  detailTitle: {
    color: '#2d221a',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 6,
  },
  detailMeta: {
    color: '#5f4b3d',
    fontSize: 14,
    marginTop: 6,
  },
  detailAddress: {
    color: '#7c6252',
    fontSize: 14,
    marginTop: 4,
  },
  addressButton: {
    alignSelf: 'flex-start',
  },
  detailLinkText: {
    color: '#1f5f5b',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  detailMapCard: {
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    overflow: 'hidden',
  },
  detailMap: {
    height: 170,
    width: '100%',
  },
  detailMapCaption: {
    backgroundColor: '#fff7ef',
    borderTopColor: '#efd8bd',
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  detailMapCaptionText: {
    color: '#5f4b3d',
    fontSize: 13,
    fontWeight: '600',
  },
  reviewSummaryCard: {
    backgroundColor: '#fff3e5',
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  reviewSummaryRating: {
    color: '#2d221a',
    fontSize: 18,
    fontWeight: '800',
  },
  reviewSummaryMeta: {
    color: '#6c5443',
    fontSize: 13,
    marginTop: 4,
  },
  reviewList: {
    gap: 12,
    marginTop: 12,
  },
  reviewCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd8bd',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  reviewQuote: {
    color: '#4d3a2f',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 21,
  },
  linkButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f5f5b',
    borderRadius: 14,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  linkButtonText: {
    color: '#effffd',
    fontWeight: '700',
  },
  linkButtonSecondary: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ef',
    borderColor: '#1f5f5b',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  linkButtonSecondaryText: {
    color: '#1f5f5b',
    fontWeight: '700',
  },
  dealCard: {
    backgroundColor: '#fff3e5',
    borderRadius: 18,
    marginTop: 14,
    padding: 14,
  },
  dealHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  dealTitle: {
    color: '#2f241b',
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  pill: {
    backgroundColor: '#f8d8bf',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: {
    color: '#7f461f',
    fontSize: 12,
    fontWeight: '700',
  },
  dealPrice: {
    color: '#bf4d0f',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  dealDescription: {
    color: '#5b4c41',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  dealTerms: {
    color: '#7a6658',
    fontSize: 13,
    marginTop: 8,
  },
  hourList: {
    gap: 10,
    marginTop: 10,
  },
  hourGroupCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#efd9c5',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hourGroupDays: {
    color: '#7f461f',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  hourRow: {
    color: '#43352c',
    fontSize: 13,
  },
  emptyStateText: {
    color: '#735e4c',
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 20,
  },
  errorBanner: {
    backgroundColor: '#ffe0d6',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: '#8d2500',
    fontSize: 13,
    lineHeight: 18,
  },
  mapErrorBanner: {
    alignSelf: 'stretch',
  },
});
