import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';

import type { CurrentHappyHourPlace, CurrentHappyHourWindow } from '../types';
import { styles } from '../appStyles';
import {
  isNativeIOSCurrentHappyHoursUpMenuAvailable,
  NativeIOSCurrentHappyHoursUpMenu,
} from './NativeCurrentHappyHoursUpMenu';

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

function formatWindow(window: CurrentHappyHourWindow) {
  if (window.all_day) {
    return `${window.title} - All day`;
  }

  const start = formatTime(window.start_time);
  const end = formatTime(window.end_time);
  const timeRange = start && end ? `${start}-${end}` : 'Happening now';
  return `${window.title} - ${timeRange}`;
}

function formatWindowDetails(window: CurrentHappyHourWindow) {
  if (window.all_day) {
    return 'All day';
  }

  const start = formatTime(window.start_time);
  const end = formatTime(window.end_time);
  return start && end ? `${start}-${end}` : 'Happening now';
}

function getPlaceAccessibilityLabel(place: CurrentHappyHourPlace) {
  const windows = place.happy_hours.map(formatWindow).join(', ');
  return `${place.name}, ${windows}. Open business details.`;
}

export type CurrentHappyHoursUpMenuProps = {
  places: CurrentHappyHourPlace[];
  expanded: boolean;
  onToggle: () => void;
  onSelectPlace: (place: { slug: string; locationId: number }) => void;
  bottomOffset: number;
  theme: 'dark' | 'light';
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
}: CurrentHappyHoursUpMenuProps) {
  const isDark = theme === 'dark';
  const countLabel = `${places.length} happy hour${places.length === 1 ? '' : 's'} happening now`;
  const placeCountLabel = places.length === 1 ? '1 business' : `${places.length} businesses`;
  const [panelMounted, setPanelMounted] = useState(expanded);
  const panelProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const menuTranslateX = useRef(new Animated.Value(0)).current;
  const swipeDismissedRef = useRef(false);

  useEffect(() => {
    panelProgress.stopAnimation();
    menuTranslateX.stopAnimation();

    if (expanded) {
      swipeDismissedRef.current = false;
      setPanelMounted(true);
      Animated.parallel([
        Animated.timing(panelProgress, {
          duration: 220,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(menuTranslateX, {
          duration: 220,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();
      return () => {
        panelProgress.stopAnimation();
        menuTranslateX.stopAnimation();
      };
    }

    const preserveSwipeOffset = swipeDismissedRef.current;
    Animated.parallel([
      Animated.timing(panelProgress, {
        duration: 200,
        toValue: 0,
        useNativeDriver: true,
      }),
      ...(preserveSwipeOffset ? [] : [Animated.timing(menuTranslateX, {
        duration: 200,
        toValue: 0,
        useNativeDriver: true,
      })]),
    ]).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setPanelMounted(false);
      menuTranslateX.setValue(0);
      swipeDismissedRef.current = false;
    });

    return () => {
      panelProgress.stopAnimation();
      menuTranslateX.stopAnimation();
    };
  }, [expanded, menuTranslateX, panelProgress]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) => (
      expanded
      && panelMounted
      && Math.abs(gestureState.dx) > 12
      && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
    ),
    onMoveShouldSetPanResponderCapture: (_event, gestureState) => (
      expanded
      && panelMounted
      && Math.abs(gestureState.dx) > 12
      && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
    ),
    onPanResponderMove: (_event, gestureState) => {
      menuTranslateX.setValue(gestureState.dx);
    },
    onPanResponderRelease: (_event, gestureState) => {
      const isHorizontalSwipe = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      if (!isHorizontalSwipe || Math.abs(gestureState.dx) < 72) {
        Animated.spring(menuTranslateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
        return;
      }

      swipeDismissedRef.current = true;
      const direction = gestureState.dx >= 0 ? 1 : -1;
      const dismissDistance = Math.max(Dimensions.get('window').width, 360);
      Animated.timing(menuTranslateX, {
        duration: 180,
        toValue: direction * dismissDistance,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onToggle();
        }
      });
    },
    onPanResponderTerminate: () => {
      Animated.spring(menuTranslateX, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    },
  }), [expanded, menuTranslateX, onToggle, panelMounted]);

  const shouldRenderPanel = expanded || panelMounted;

  return (
    <View pointerEvents="box-none" style={[styles.currentHappyHoursLayer, { bottom: bottomOffset }]}>
      {shouldRenderPanel ? (
        <Animated.View
          {...panResponder.panHandlers}
          pointerEvents={expanded ? 'auto' : 'none'}
          style={{
            opacity: panelProgress,
            transform: [
              { translateX: menuTranslateX },
              { translateY: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
            ],
          }}
        >
        <View accessibilityViewIsModal={false} style={[styles.currentHappyHoursPanel, isDark ? null : styles.currentHappyHoursPanelLight]} testID="current-happy-hours-menu">
          <View style={styles.currentHappyHoursPanelHeader}>
            <View style={styles.currentHappyHoursPanelHeading}>
              <View style={styles.currentHappyHoursLiveHeading}>
                <View style={styles.currentHappyHoursLiveDot} />
                <Text style={[styles.currentHappyHoursPanelTitle, isDark ? null : styles.currentHappyHoursLightText]}>Happy hours happening now</Text>
              </View>
              <Text style={[styles.currentHappyHoursPanelMeta, isDark ? null : styles.currentHappyHoursLightMutedText]}>{placeCountLabel}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close businesses with happy hours now"
              accessibilityRole="button"
              hitSlop={4}
              onPress={onToggle}
              style={[styles.currentHappyHoursCloseButton, isDark ? null : styles.currentHappyHoursCloseButtonLight]}
              testID="current-happy-hours-close"
            >
              <Ionicons color={isDark ? '#f5f7fb' : '#171d27'} name="chevron-down" size={18} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.currentHappyHoursList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.currentHappyHoursScroll}
            testID="current-happy-hours-list"
          >
            {places.map((place) => (
              <Pressable
                accessibilityLabel={getPlaceAccessibilityLabel(place)}
                accessibilityRole="button"
                key={`${place.slug}:${place.location_id}`}
                onPress={() => onSelectPlace({ locationId: place.location_id, slug: place.slug })}
                style={[styles.currentHappyHoursRow, isDark ? null : styles.currentHappyHoursRowLight]}
                testID={`current-happy-hours-row-${place.slug}:${place.location_id}`}
              >
                <View style={styles.currentHappyHoursRowCopy}>
                  <Text numberOfLines={1} style={[styles.currentHappyHoursRowTitle, isDark ? null : styles.currentHappyHoursLightText]}>{place.name}</Text>
                  <Text numberOfLines={1} style={[styles.currentHappyHoursRowMeta, isDark ? null : styles.currentHappyHoursLightMutedText]}>
                    {[place.city_label, place.venue_type_label].filter(Boolean).join(' | ') || place.address_line_1}
                  </Text>
                  {place.happy_hours.map((window, index) => (
                    <View
                      key={`${window.deal_id ?? window.title}:${window.weekday_label}:${window.start_time}:${window.end_time}:${index}`}
                    >
                      <Text numberOfLines={1} style={[styles.currentHappyHoursDealTitle, isDark ? null : styles.currentHappyHoursLightText]}>{window.title}</Text>
                      <Text numberOfLines={1} style={[styles.currentHappyHoursDealText, isDark ? null : styles.currentHappyHoursLightMutedText]}>
                        {formatWindowDetails(window)}{window.price_text ? ` | ${window.price_text}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
                <Ionicons color={isDark ? '#8b95a8' : '#6f7c8f'} name="arrow-forward" size={17} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
        </Animated.View>
      ) : null}

      <Pressable
        accessibilityHint="Swipe the open list left or right to clear the map view."
        accessibilityLabel={`${countLabel}. ${expanded ? 'Close list.' : 'Open list.'}`}
        accessibilityRole="button"
        onPress={onToggle}
        style={[styles.currentHappyHoursTrigger, isDark ? null : styles.currentHappyHoursTriggerLight]}
        testID="current-happy-hours-toggle"
      >
        <Ionicons color={isDark ? '#f5f7fb' : '#171d27'} name={expanded ? 'chevron-down' : 'chevron-up'} size={19} />
        <View style={styles.currentHappyHoursLiveDot} />
        <Text style={[styles.currentHappyHoursTriggerTitle, isDark ? null : styles.currentHappyHoursLightText]}>{places.length} happy hour{places.length === 1 ? '' : 's'} now</Text>
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
