import { useMemo } from 'react';
import {
  Dimensions,
  Platform,
  UIManager,
  requireNativeComponent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { CurrentHappyHourPlace, CurrentHappyHourWindow } from '../types';
import { getVenuePlaceholderColor } from '../browseConfig';
import type { CurrentHappyHoursUpMenuProps } from './CurrentHappyHoursUpMenu';

type NativeCurrentHappyHoursUpMenuProps = {
  bottomOffset: number;
  expanded: boolean;
  expandedSheetHeight: number;
  onCalendarPress?: (event: NativeSyntheticEvent<{ locationId: number; slug: string; dealId?: number; happyHourWindow?: unknown }>) => void;
  onFavoritePress?: (event: NativeSyntheticEvent<{ locationId: number; slug: string }>) => void;
  onMenuToggle?: (event: NativeSyntheticEvent<{ expanded: boolean }>) => void;
  onPlaceSelect?: (event: NativeSyntheticEvent<{ locationId: number; slug: string }>) => void;
  onSharePress?: (event: NativeSyntheticEvent<{ locationId: number; slug: string; dealId?: number; happyHourWindow?: unknown }>) => void;
  places: CurrentHappyHourPlace[];
  showFavoriteActions?: boolean;
  style?: StyleProp<ViewStyle>;
  theme: 'dark' | 'light';
  userLatitude?: number | null;
  userLongitude?: number | null;
};

type NativeCurrentHappyHourPlace = CurrentHappyHourPlace & {
  image_placeholder_color: string;
};

const nativeCurrentHappyHoursUpMenuViewName = 'DiningDealzCurrentHappyHoursUpMenuView';
const minimumIOSCurrentHappyHoursVersion = 15;

const NativeCurrentHappyHoursUpMenuView = requireNativeComponent<NativeCurrentHappyHoursUpMenuProps>(
  nativeCurrentHappyHoursUpMenuViewName,
);

function isSupportedIOSCurrentHappyHoursRuntime() {
  if (Platform.OS !== 'ios') {
    return false;
  }

  const iosVersion = typeof Platform.Version === 'string'
    ? Number.parseInt(Platform.Version, 10)
    : Platform.Version;

  return Number.isFinite(iosVersion) && iosVersion >= minimumIOSCurrentHappyHoursVersion;
}

function hasNativeCurrentHappyHoursViewManager() {
  if (!isSupportedIOSCurrentHappyHoursRuntime()) {
    return false;
  }

  const nativeUIManager = UIManager as typeof UIManager & {
    [key: string]: unknown;
    hasViewManagerConfig?: (name: string) => boolean;
  };
  const getViewManagerConfig = nativeUIManager.getViewManagerConfig?.bind(nativeUIManager);

  if (nativeUIManager.hasViewManagerConfig?.(nativeCurrentHappyHoursUpMenuViewName)) {
    return true;
  }

  if (
    getViewManagerConfig?.(nativeCurrentHappyHoursUpMenuViewName)
    || getViewManagerConfig?.(`${nativeCurrentHappyHoursUpMenuViewName}Manager`)
  ) {
    return true;
  }

  return Boolean(
    nativeUIManager[nativeCurrentHappyHoursUpMenuViewName]
    || nativeUIManager[`${nativeCurrentHappyHoursUpMenuViewName}Manager`],
  );
}

export function isNativeIOSCurrentHappyHoursUpMenuAvailable() {
  return hasNativeCurrentHappyHoursViewManager();
}

function getNativeCurrentHappyHoursUpMenuStyle(
  bottomInset: number,
  expandedSheetHeight: number,
): StyleProp<ViewStyle> {
  return {
    bottom: -Math.max(bottomInset, 0),
    // Keep the native host tall enough for the sheet to reveal its mounted
    // content continuously during a drag from the collapsed position.
    height: expandedSheetHeight,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 60,
  };
}

export function NativeIOSCurrentHappyHoursUpMenu({
  bottomOffset,
  bottomInset = 0,
  expanded,
  onSelectPlace,
  onFavoritePlace,
  onAddToCalendar,
  onSharePlace,
  onToggle,
  places,
  showFavoriteActions = true,
  theme,
  userCoordinates,
}: CurrentHappyHoursUpMenuProps) {
  const nativePlaces = useMemo<NativeCurrentHappyHourPlace[]>(
    () => places.map((place) => ({
      ...place,
      image_placeholder_color: getVenuePlaceholderColor(place.venue_type_label),
    })),
    [places],
  );

  if (places.length === 0 || !isNativeIOSCurrentHappyHoursUpMenuAvailable()) {
    return null;
  }

  const expandedSheetHeight = Math.min(
    Math.max(Math.round(Dimensions.get('window').height * 0.82), 520),
    640,
  );
  const resolveNativePlace = (event: NativeSyntheticEvent<{ locationId: number; slug: string; dealId?: number; happyHourWindow?: unknown }>) => (
    places.find((place) => place.slug === event.nativeEvent.slug && place.location_id === event.nativeEvent.locationId)
  );

  const resolveNativeWindow = (event: NativeSyntheticEvent<{ locationId: number; slug: string; dealId?: number; happyHourWindow?: unknown }>) => {
    const nativeWindow = event.nativeEvent.happyHourWindow;
    return nativeWindow && typeof nativeWindow === 'object'
      ? nativeWindow as CurrentHappyHourWindow
      : undefined;
  };

  return (
    <NativeCurrentHappyHoursUpMenuView
      bottomOffset={bottomOffset}
      expanded={expanded}
      expandedSheetHeight={expandedSheetHeight}
      onCalendarPress={onAddToCalendar ? (event) => {
        const place = resolveNativePlace(event);
        if (place) {
          onAddToCalendar(place, resolveNativeWindow(event));
        }
      } : undefined}
      onFavoritePress={(event) => onFavoritePlace?.(event.nativeEvent)}
      onMenuToggle={() => onToggle()}
      onPlaceSelect={(event) => onSelectPlace(event.nativeEvent)}
      onSharePress={onSharePlace ? (event) => {
        const place = resolveNativePlace(event);
        if (place) {
          onSharePlace(place, resolveNativeWindow(event));
        }
      } : undefined}
      places={nativePlaces}
      showFavoriteActions={showFavoriteActions}
      style={getNativeCurrentHappyHoursUpMenuStyle(bottomInset, expandedSheetHeight)}
      theme={theme}
      userLatitude={userCoordinates?.latitude ?? null}
      userLongitude={userCoordinates?.longitude ?? null}
    />
  );
}
