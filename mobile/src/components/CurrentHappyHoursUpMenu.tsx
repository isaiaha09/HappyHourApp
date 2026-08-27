import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

import type { CurrentHappyHourPlace, CurrentHappyHourWindow } from '../types';
import { styles } from '../appStyles';
import { getVenueMarkerStyle, type VenueFilterValue } from '../browseConfig';
import {
  isNativeIOSCurrentHappyHoursUpMenuAvailable,
  NativeIOSCurrentHappyHoursUpMenu,
} from './NativeCurrentHappyHoursUpMenu';

const currentHappyHoursTitle = 'Happy Hour Deals and Specials Happening Now';

function formatTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return value;
  }

  const hour = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return value;
  }

  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
}

function formatWindowDetails(window: CurrentHappyHourWindow) {
  if (window.all_day) {
    return 'All day';
  }

  const start = formatTime(window.start_time);
  const end = formatTime(window.end_time);
  return start && end ? `${start} - ${end}` : 'Happening now';
}

function formatDealLine(window: CurrentHappyHourWindow) {
  return [window.price_text.trim(), window.title.trim()]
    .filter(Boolean)
    .join(' ');
}

function formatWindow(window: CurrentHappyHourWindow) {
  const dealLine = formatDealLine(window) || 'Happy Hour';
  return `${dealLine}, ${formatWindowDetails(window)}`;
}

function getPlaceAccessibilityLabel(place: CurrentHappyHourPlace, distanceLabel: string | null) {
  const windows = place.happy_hours.map(formatWindow).join(', ');
  const distance = distanceLabel ? ` ${distanceLabel}.` : '';
  return `${place.name}.${distance} ${windows}. Open business details.`;
}

function getCardImageUrl(place: CurrentHappyHourPlace) {
  return (place.image_urls ?? []).find((imageUrl) => /^https?:\/\//i.test(imageUrl.trim())) ?? null;
}

function getVenueFilterValue(venueTypeLabel: string): VenueFilterValue {
  const normalizedLabel = venueTypeLabel.trim().toLowerCase();

  if (normalizedLabel.includes('restaurant')) {
    return 'restaurant';
  }
  if (normalizedLabel.includes('bar')) {
    return 'bar';
  }
  if (normalizedLabel.includes('fast')) {
    return 'fast_food';
  }
  if (normalizedLabel.includes('mobile') || normalizedLabel.includes('vendor')) {
    return 'mobile';
  }
  if (normalizedLabel.includes('cafe') || normalizedLabel.includes('coffee')) {
    return 'cafe';
  }
  if (normalizedLabel.includes('shop') || normalizedLabel.includes('store')) {
    return 'shop';
  }
  if (normalizedLabel.includes('attraction')) {
    return 'attraction';
  }

  return 'other';
}

function getCategoryPlaceholderIcon(venueTypeLabel: string) {
  return getVenueMarkerStyle(getVenueFilterValue(venueTypeLabel)).icon;
}

export type CurrentHappyHoursUserCoordinates = {
  latitude: number;
  longitude: number;
};

function getDistanceLabel(
  userCoordinates: CurrentHappyHoursUserCoordinates | null | undefined,
  place: CurrentHappyHourPlace,
) {
  if (
    !userCoordinates
    || place.latitude === null
    || place.longitude === null
  ) {
    return null;
  }

  const miles = getDistanceInMiles(
    userCoordinates.latitude,
    userCoordinates.longitude,
    place.latitude,
    place.longitude,
  );
  if (!Number.isFinite(miles)) {
    return null;
  }

  if (miles < 0.15) {
    return 'Nearby';
  }

  const roundedMiles = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  return `${roundedMiles} mi`;
}

function getDistanceInMiles(
  originLatitude: number,
  originLongitude: number,
  destinationLatitude: number,
  destinationLongitude: number,
) {
  const earthRadiusMiles = 3958.8;
  const latitudeDeltaRadians = (destinationLatitude - originLatitude) * Math.PI / 180;
  const longitudeDeltaRadians = (destinationLongitude - originLongitude) * Math.PI / 180;
  const originLatitudeRadians = originLatitude * Math.PI / 180;
  const destinationLatitudeRadians = destinationLatitude * Math.PI / 180;
  const a = Math.sin(latitudeDeltaRadians / 2) ** 2
    + Math.cos(originLatitudeRadians)
    * Math.cos(destinationLatitudeRadians)
    * Math.sin(longitudeDeltaRadians / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

export type CurrentHappyHoursUpMenuProps = {
  places: CurrentHappyHourPlace[];
  expanded: boolean;
  onToggle: () => void;
  onSelectPlace: (place: { slug: string; locationId: number }) => void;
  onFavoritePlace?: (place: { slug: string; locationId: number }) => void;
  bottomOffset: number;
  bottomInset?: number;
  theme: 'dark' | 'light';
  userCoordinates?: CurrentHappyHoursUserCoordinates | null;
};

type CurrentHappyHoursGestureStateChangeEvent = {
  nativeEvent: {
    oldState: number;
    state: number;
    translationY: number;
  };
};

export function ReactNativeCurrentHappyHoursUpMenu(props: CurrentHappyHoursUpMenuProps) {
  if (props.places.length === 0) {
    return null;
  }

  return <ReactNativeCurrentHappyHoursUpMenuContent {...props} />;
}

function ReactNativeCurrentHappyHoursUpMenuContent({
  places,
  expanded,
  onToggle,
  onSelectPlace,
  onFavoritePlace,
  bottomOffset,
  bottomInset = 0,
  theme,
  userCoordinates,
}: CurrentHappyHoursUpMenuProps) {
  const isDark = theme === 'dark';
  const dealCount = places.reduce((count, place) => count + place.happy_hours.length, 0);
  const dealCountLabel = `${dealCount} deal${dealCount === 1 ? '' : 's'} nearby`;
  const collapsedSheetHeight = Math.max(bottomOffset + 52, 132);
  const resolvedBottomInset = Math.max(bottomInset, 0);
  const expandedSheetHeight = Math.min(
    Math.max(Math.round(Dimensions.get('window').height * 0.82), 520),
    640,
  );
  const sheetTravel = Math.max(expandedSheetHeight - collapsedSheetHeight, 1);
  const panelProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const sheetDragY = useRef(new Animated.Value(0)).current;
  const sheetGestureWasActiveRef = useRef(false);

  useEffect(() => {
    panelProgress.stopAnimation();
    sheetDragY.stopAnimation();
    sheetDragY.setValue(0);

    Animated.timing(panelProgress, {
      duration: expanded ? 260 : 220,
      toValue: expanded ? 1 : 0,
      useNativeDriver: true,
    }).start();

    return () => {
      panelProgress.stopAnimation();
    };
  }, [expanded, panelProgress, sheetDragY]);

  const handleSheetGestureEvent = useMemo(() => Animated.event(
    [{ nativeEvent: { translationY: sheetDragY } }],
    { useNativeDriver: true },
  ), [sheetDragY]);

  const progressForTranslationY = useCallback((translationY: number) => {
    const nextProgress = expanded
      ? 1 - Math.max(translationY, 0) / sheetTravel
      : Math.max(-translationY, 0) / sheetTravel;
    return Math.max(0, Math.min(1, nextProgress));
  }, [expanded, sheetTravel]);

  const settleSheetDrag = useCallback((translationY: number) => {
    panelProgress.stopAnimation();
    panelProgress.setValue(progressForTranslationY(translationY));
    sheetDragY.stopAnimation();
    sheetDragY.setValue(0);
    Animated.spring(panelProgress, {
      damping: 24,
      stiffness: 260,
      mass: 0.9,
      toValue: expanded ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [expanded, panelProgress, progressForTranslationY, sheetDragY]);

  const clearGestureActiveFlag = useCallback(() => {
    setTimeout(() => {
      sheetGestureWasActiveRef.current = false;
    }, 0);
  }, []);

  const handleSheetGestureStateChange = useCallback((event: CurrentHappyHoursGestureStateChangeEvent) => {
    const { oldState, state, translationY } = event.nativeEvent;

    if (state === State.BEGAN) {
      sheetGestureWasActiveRef.current = false;
      panelProgress.stopAnimation();
      sheetDragY.stopAnimation();
      sheetDragY.setValue(0);
      return;
    }

    if (state === State.ACTIVE) {
      sheetGestureWasActiveRef.current = true;
      panelProgress.stopAnimation();
      return;
    }

    if (state === State.CANCELLED || state === State.FAILED) {
      settleSheetDrag(translationY);
      clearGestureActiveFlag();
      return;
    }

    if (state !== State.END || oldState !== State.ACTIVE) {
      return;
    }

    const shouldExpand = !expanded && translationY <= -64;
    const shouldCollapse = expanded && translationY >= 64;

    if (shouldExpand || shouldCollapse) {
      panelProgress.stopAnimation();
      panelProgress.setValue(progressForTranslationY(translationY));
      sheetDragY.stopAnimation();
      sheetDragY.setValue(0);
      onToggle();
      clearGestureActiveFlag();
      return;
    }

    settleSheetDrag(translationY);
    clearGestureActiveFlag();
  }, [clearGestureActiveFlag, expanded, onToggle, panelProgress, progressForTranslationY, settleSheetDrag, sheetDragY]);

  const handleSheetTap = useCallback(() => {
    if (sheetGestureWasActiveRef.current) {
      return;
    }

    onToggle();
  }, [onToggle]);

  const livePanelProgress = Animated.add(
    panelProgress,
    Animated.multiply(sheetDragY, -1 / sheetTravel),
  ).interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const sheetOffsetY = livePanelProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetTravel, 0],
    extrapolate: 'clamp',
  });
  const triggerOpacity = livePanelProgress.interpolate({
    inputRange: [0, 0.34, 0.5],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });
  const expandedHeaderOpacity = livePanelProgress.interpolate({
    inputRange: [0, 0.5, 0.68, 1],
    outputRange: [0, 0, 1, 1],
    extrapolate: 'clamp',
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.currentHappyHoursLayer, { bottom: -resolvedBottomInset }]}
    >
      <Animated.View
        pointerEvents="auto"
        style={[
          styles.currentHappyHoursSheetFrame,
          {
            bottom: 0,
            height: expandedSheetHeight,
            left: 0,
            position: 'absolute',
            right: 0,
            transform: [{ translateY: sheetOffsetY }],
          },
        ]}
      >
          <Animated.View
            style={[
              styles.currentHappyHoursSheet,
              styles.currentHappyHoursSheetExpanded,
              isDark ? styles.currentHappyHoursSheetDark : styles.currentHappyHoursSheetLight,
              { flex: 1 },
            ]}
          >
            <PanGestureHandler
              activeOffsetY={[-10, 10]}
              failOffsetX={[-20, 20]}
              onGestureEvent={handleSheetGestureEvent}
              onHandlerStateChange={handleSheetGestureStateChange}
            >
              <Animated.View style={styles.currentHappyHoursSheetHeader}>
                <View style={styles.currentHappyHoursSheetHandle}>
                  <View style={[styles.currentHappyHoursSheetHandleBar, isDark ? styles.currentHappyHoursSheetHandleBarDark : null]} />
                </View>

                <View style={{ minHeight: 56, position: 'relative' }}>
                  <Animated.View
                    pointerEvents={expanded ? 'none' : 'auto'}
                    style={{ opacity: triggerOpacity, transform: [{ translateY: -6 }] }}
                  >
                    <Pressable
                      accessibilityHint="Swipe up to browse deals. Swipe down on the expanded sheet to close it."
                      accessibilityLabel={dealCountLabel + '. ' + (expanded ? 'Close list.' : 'Open list.')}
                      onPress={handleSheetTap}
                      style={styles.currentHappyHoursTriggerHeadingRow}
                      testID="current-happy-hours-toggle"
                    >
                      <View style={styles.currentHappyHoursTriggerDot} />
                      <Text style={[styles.currentHappyHoursTriggerTitle, isDark ? styles.currentHappyHoursTriggerTitleDark : null]}>
                        {dealCountLabel}
                      </Text>
                    </Pressable>
                  </Animated.View>

                  <Animated.View
                    pointerEvents={expanded ? 'auto' : 'none'}
                    style={{ left: 0, opacity: expandedHeaderOpacity, position: 'absolute', right: 0, top: 0 }}
                  >
                    <View style={styles.currentHappyHoursSheetHeadingRow}>
                      <View style={styles.currentHappyHoursSheetHeadingCopy}>
                        <Text style={[styles.currentHappyHoursSheetTitle, isDark ? styles.currentHappyHoursSheetTitleDark : null]}>
                          {currentHappyHoursTitle}
                        </Text>
                        <Text style={[styles.currentHappyHoursSheetMeta, isDark ? styles.currentHappyHoursSheetMetaDark : null]}>
                          {dealCountLabel}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel="Close current happy hour deals"
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={onToggle}
                        style={[styles.currentHappyHoursSheetClose, isDark ? styles.currentHappyHoursSheetCloseDark : null]}
                        testID="current-happy-hours-close"
                      >
                        <Ionicons color={isDark ? '#f6f7f3' : '#252525'} name="chevron-down" size={20} />
                      </Pressable>
                    </View>
                  </Animated.View>
                </View>
              </Animated.View>
            </PanGestureHandler>

            <Animated.View
              pointerEvents={expanded ? 'auto' : 'none'}
              style={[
                styles.currentHappyHoursSheetContent,
                {
                  opacity: 1,
                },
              ]}
              testID="current-happy-hours-menu"
            >
              <ScrollView
                contentContainerStyle={styles.currentHappyHoursSheetList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                testID="current-happy-hours-list"
              >
                {places.map((place) => (
                  <CurrentHappyHoursDealCard
                    isDark={isDark}
                    key={`${place.slug}:${place.location_id}`}
                    onFavorite={() => onFavoritePlace?.({ locationId: place.location_id, slug: place.slug })}
                    onSelect={() => onSelectPlace({ locationId: place.location_id, slug: place.slug })}
                    place={place}
                    userCoordinates={userCoordinates}
                  />
                ))}
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </Animated.View>

    </View>
  );
}

type CurrentHappyHoursDealCardProps = {
  isDark: boolean;
  onFavorite: () => void;
  onSelect: () => void;
  place: CurrentHappyHourPlace;
  userCoordinates?: CurrentHappyHoursUserCoordinates | null;
};

function CurrentHappyHoursDealCard({ isDark, onFavorite, onSelect, place, userCoordinates }: CurrentHappyHoursDealCardProps) {
  const imageUrl = getCardImageUrl(place);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const distanceLabel = getDistanceLabel(userCoordinates, place);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [imageUrl]);

  const shouldRenderImage = imageUrl !== null && !imageLoadFailed;

  return (
    <View style={[styles.currentHappyHoursDealCard, isDark ? styles.currentHappyHoursDealCardDark : null]}>
      <Pressable
        accessibilityLabel={getPlaceAccessibilityLabel(place, distanceLabel)}
        accessibilityRole="button"
        onPress={onSelect}
        style={styles.currentHappyHoursDealCardContent}
        testID={`current-happy-hours-row-${place.slug}:${place.location_id}`}
      >
        <View style={styles.currentHappyHoursDealImageFrame}>
          {shouldRenderImage ? (
            <Image
              onError={() => setImageLoadFailed(true)}
              resizeMode="cover"
              source={{ uri: imageUrl }}
              style={styles.currentHappyHoursDealImage}
            />
          ) : (
            <View style={[styles.currentHappyHoursDealImagePlaceholder, isDark ? styles.currentHappyHoursDealImagePlaceholderDark : null]}>
              <MaterialCommunityIcons color={isDark ? '#f2f4f1' : '#68716a'} name={getCategoryPlaceholderIcon(place.venue_type_label)} size={34} />
            </View>
          )}
          <View style={styles.currentHappyHoursDealImageShade} />
          <View style={styles.currentHappyHoursDealImageCopy}>
            <Text numberOfLines={1} style={styles.currentHappyHoursDealName}>{place.name}</Text>
            <Text numberOfLines={1} style={styles.currentHappyHoursDealMeta}>
              {[place.city_label, place.venue_type_label].filter(Boolean).join(' • ')}
            </Text>
          </View>
          {distanceLabel ? <Text style={styles.currentHappyHoursDealDistance}>{distanceLabel}</Text> : null}
        </View>

        <View style={styles.currentHappyHoursDealBody}>
          {place.happy_hours.map((window, index) => (
            <View key={`${window.deal_id ?? window.title}:${window.weekday_label}:${index}`} style={styles.currentHappyHoursDealLineBlock}>
              <Text numberOfLines={2} style={[styles.currentHappyHoursDealLine, isDark ? styles.currentHappyHoursDealLineDark : null]}>
                {formatDealLine(window) || 'Happy Hour'}
              </Text>
            </View>
          ))}

          <View style={styles.currentHappyHoursDealFooter}>
            <View style={styles.currentHappyHoursDealTimeChip}>
              <Text style={styles.currentHappyHoursDealTimeText}>
                {place.happy_hours.map(formatWindowDetails).join(' • ')}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      <Pressable
        accessibilityLabel={`Favorite ${place.name}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onFavorite}
        style={styles.currentHappyHoursDealFavorite}
        testID={`current-happy-hours-favorite-${place.slug}:${place.location_id}`}
      >
        <Ionicons color="#1e211f" name="heart-outline" size={17} />
      </Pressable>
    </View>
  );
}

export function CurrentHappyHoursUpMenu(props: CurrentHappyHoursUpMenuProps) {
  if (isNativeIOSCurrentHappyHoursUpMenuAvailable()) {
    return <NativeIOSCurrentHappyHoursUpMenu {...props} />;
  }

  return <ReactNativeCurrentHappyHoursUpMenu {...props} />;
}
