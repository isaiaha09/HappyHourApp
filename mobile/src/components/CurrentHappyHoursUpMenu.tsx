import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';

import type { CurrentHappyHourPlace, CurrentHappyHourWindow } from '../types';
import { styles } from '../appStyles';
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
  bottomOffset: number;
  theme: 'dark' | 'light';
  userCoordinates?: CurrentHappyHoursUserCoordinates | null;
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
  bottomOffset,
  theme,
  userCoordinates,
}: CurrentHappyHoursUpMenuProps) {
  const isDark = theme === 'dark';
  const dealCount = places.reduce((count, place) => count + place.happy_hours.length, 0);
  const dealCountLabel = `${dealCount} deal${dealCount === 1 ? '' : 's'} nearby`;
  const expandedSheetHeight = Math.min(
    Math.max(Math.round(Dimensions.get('window').height * 0.82), 520),
    640,
  );
  const [panelMounted, setPanelMounted] = useState(expanded);
  const panelProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const sheetHeight = useRef(new Animated.Value(expanded ? expandedSheetHeight : 0)).current;
  const sheetDragY = useRef(new Animated.Value(0)).current;
  const sheetDragX = useRef(new Animated.Value(0)).current;
  const preserveHorizontalDismissalRef = useRef(false);

  useEffect(() => {
    panelProgress.stopAnimation();
    sheetHeight.stopAnimation();
    sheetDragY.stopAnimation();
    sheetDragX.stopAnimation();

    if (expanded) {
      preserveHorizontalDismissalRef.current = false;
      setPanelMounted(true);
      Animated.timing(sheetHeight, {
        duration: 260,
        toValue: expandedSheetHeight,
        useNativeDriver: false,
      }).start();
      Animated.parallel([
        Animated.timing(panelProgress, {
          duration: 260,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(sheetDragY, {
          duration: 220,
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(sheetDragX, {
          duration: 220,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();

      return () => {
        panelProgress.stopAnimation();
        sheetHeight.stopAnimation();
        sheetDragY.stopAnimation();
        sheetDragX.stopAnimation();
      };
    }

    const preserveHorizontalDismissal = preserveHorizontalDismissalRef.current;
    Animated.timing(sheetHeight, {
      duration: 220,
      toValue: 0,
      useNativeDriver: false,
    }).start();
    Animated.parallel([
      Animated.timing(panelProgress, {
        duration: 220,
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(sheetDragY, {
        duration: 220,
        toValue: 0,
        useNativeDriver: true,
      }),
      ...(preserveHorizontalDismissal ? [] : [Animated.timing(sheetDragX, {
        duration: 220,
        toValue: 0,
        useNativeDriver: true,
      })]),
    ]).start(({ finished }) => {
      if (finished) {
        sheetDragX.setValue(0);
        preserveHorizontalDismissalRef.current = false;
        setPanelMounted(false);
      }
    });

    return () => {
      panelProgress.stopAnimation();
      sheetHeight.stopAnimation();
      sheetDragY.stopAnimation();
      sheetDragX.stopAnimation();
    };
  }, [expanded, expandedSheetHeight, panelProgress, sheetDragX, sheetDragY, sheetHeight]);

  const sheetPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) => {
      const isVerticalDrag = Math.abs(gestureState.dy) > 10
        && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      const isHorizontalDismissal = expanded
        && Math.abs(gestureState.dx) > 10
        && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      return (expanded || !panelMounted) && (isVerticalDrag || isHorizontalDismissal);
    },
    onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
      const isVerticalDrag = Math.abs(gestureState.dy) > 10
        && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      const isHorizontalDismissal = expanded
        && Math.abs(gestureState.dx) > 10
        && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      return (expanded || !panelMounted) && (isVerticalDrag || isHorizontalDismissal);
    },
    onPanResponderMove: (_event, gestureState) => {
      if (expanded && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
        sheetDragX.setValue(Math.max(Math.min(gestureState.dx, 180), -180));
        sheetDragY.setValue(0);
      } else if (!expanded && gestureState.dy < 0) {
        sheetDragX.setValue(0);
        sheetDragY.setValue(Math.max(gestureState.dy, -180));
      } else if (expanded && gestureState.dy > 0) {
        sheetDragX.setValue(0);
        sheetDragY.setValue(Math.min(gestureState.dy, 180));
      } else {
        sheetDragX.setValue(0);
        sheetDragY.setValue(0);
      }
    },
    onPanResponderRelease: (_event, gestureState) => {
      const shouldExpand = !expanded && gestureState.dy <= -64;
      const shouldCollapse = expanded && gestureState.dy >= 64;
      const shouldDismissHorizontally = expanded
        && Math.abs(gestureState.dx) >= 72
        && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);

      if (shouldDismissHorizontally) {
        const direction = gestureState.dx >= 0 ? 1 : -1;
        const dismissDistance = Math.max(Dimensions.get('window').width, 360);
        Animated.timing(sheetDragX, {
          duration: 180,
          toValue: direction * dismissDistance,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            preserveHorizontalDismissalRef.current = true;
            onToggle();
          }
        });
        return;
      }

      if (shouldExpand || shouldCollapse) {
        Animated.timing(sheetDragY, {
          duration: 180,
          toValue: 0,
          useNativeDriver: true,
        }).start();
        onToggle();
        return;
      }

      Animated.spring(sheetDragY, {
        damping: 18,
        stiffness: 220,
        toValue: 0,
        useNativeDriver: true,
      }).start();
      Animated.spring(sheetDragX, {
        damping: 18,
        stiffness: 220,
        toValue: 0,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(sheetDragY, {
        damping: 18,
        stiffness: 220,
        toValue: 0,
        useNativeDriver: true,
      }).start();
      Animated.spring(sheetDragX, {
        damping: 18,
        stiffness: 220,
        toValue: 0,
        useNativeDriver: true,
      }).start();
    },
  }), [expanded, onToggle, panelMounted, sheetDragX, sheetDragY]);

  const showExpandedSheet = expanded || panelMounted;
  const triggerOpacity = panelProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View pointerEvents="box-none" style={styles.currentHappyHoursLayer}>
      {showExpandedSheet ? (
        <Animated.View
          pointerEvents={expanded ? 'auto' : 'none'}
          style={[
            styles.currentHappyHoursSheetFrame,
            {
              bottom: 0,
              height: sheetHeight,
              left: 0,
              position: 'absolute',
              right: 0,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.currentHappyHoursSheet,
              styles.currentHappyHoursSheetExpanded,
              isDark ? styles.currentHappyHoursSheetDark : styles.currentHappyHoursSheetLight,
              {
                flex: 1,
                transform: [{ translateX: sheetDragX }, { translateY: sheetDragY }],
              },
            ]}
          >
            <View {...sheetPanResponder.panHandlers} style={styles.currentHappyHoursSheetHeader}>
              <View style={styles.currentHappyHoursSheetHandle}>
                <View style={[styles.currentHappyHoursSheetHandleBar, isDark ? styles.currentHappyHoursSheetHandleBarDark : null]} />
              </View>

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
            </View>

            <Animated.View
              pointerEvents={expanded ? 'auto' : 'none'}
              style={[
                styles.currentHappyHoursSheetContent,
                {
                  opacity: panelProgress,
                  transform: [{ translateY: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
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
                    onSelect={() => onSelectPlace({ locationId: place.location_id, slug: place.slug })}
                    place={place}
                    userCoordinates={userCoordinates}
                  />
                ))}
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      ) : null}

      <Animated.View
        pointerEvents={expanded ? 'none' : 'auto'}
        style={[
          styles.currentHappyHoursTriggerFrame,
          {
            bottom: Math.max(bottomOffset, 8),
            opacity: triggerOpacity,
            transform: !expanded ? [{ translateY: sheetDragY }] : undefined,
          },
        ]}
      >
        <View {...sheetPanResponder.panHandlers}>
          <Pressable
            accessibilityHint="Swipe up to browse deals. Swipe down on the expanded sheet to close it."
            accessibilityLabel={`${dealCountLabel}. ${expanded ? 'Close list.' : 'Open list.'}`}
            accessibilityRole="button"
            onPress={onToggle}
            style={[styles.currentHappyHoursTrigger, isDark ? styles.currentHappyHoursTriggerDark : styles.currentHappyHoursTriggerLight]}
            testID="current-happy-hours-toggle"
          >
            <Ionicons color={isDark ? '#f6f7f3' : '#222222'} name={expanded ? 'chevron-down' : 'chevron-up'} size={18} />
            <View style={styles.currentHappyHoursTriggerLiveDot} />
            <Text style={[styles.currentHappyHoursTriggerTitle, isDark ? styles.currentHappyHoursTriggerTitleDark : null]}>
              {dealCountLabel}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

type CurrentHappyHoursDealCardProps = {
  isDark: boolean;
  onSelect: () => void;
  place: CurrentHappyHourPlace;
  userCoordinates?: CurrentHappyHoursUserCoordinates | null;
};

function CurrentHappyHoursDealCard({ isDark, onSelect, place, userCoordinates }: CurrentHappyHoursDealCardProps) {
  const imageUrl = getCardImageUrl(place);
  const distanceLabel = getDistanceLabel(userCoordinates, place);

  return (
    <Pressable
      accessibilityLabel={getPlaceAccessibilityLabel(place, distanceLabel)}
      accessibilityRole="button"
      onPress={onSelect}
      style={[styles.currentHappyHoursDealCard, isDark ? styles.currentHappyHoursDealCardDark : null]}
      testID={`current-happy-hours-row-${place.slug}:${place.location_id}`}
    >
      <View style={styles.currentHappyHoursDealImageFrame}>
        {imageUrl ? (
          <Image resizeMode="cover" source={{ uri: imageUrl }} style={styles.currentHappyHoursDealImage} />
        ) : (
          <View style={[styles.currentHappyHoursDealImagePlaceholder, isDark ? styles.currentHappyHoursDealImagePlaceholderDark : null]}>
            <Ionicons color={isDark ? '#f2f4f1' : '#68716a'} name="restaurant-outline" size={34} />
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
        <View style={styles.currentHappyHoursDealAdd}>
          <Ionicons color="#1e211f" name="add" size={17} />
        </View>
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
          <View style={styles.currentHappyHoursDealLive}>
            <View style={styles.currentHappyHoursDealLiveDot} />
            <Text style={styles.currentHappyHoursDealLiveText}>Live</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function CurrentHappyHoursUpMenu(props: CurrentHappyHoursUpMenuProps) {
  if (isNativeIOSCurrentHappyHoursUpMenuAvailable()) {
    return <NativeIOSCurrentHappyHoursUpMenu {...props} />;
  }

  return <ReactNativeCurrentHappyHoursUpMenu {...props} />;
}
