import {
  Dimensions,
  Platform,
  UIManager,
  requireNativeComponent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { CurrentHappyHourPlace } from '../types';
import type { CurrentHappyHoursUpMenuProps } from './CurrentHappyHoursUpMenu';

type NativeCurrentHappyHoursUpMenuProps = {
  bottomOffset: number;
  expanded: boolean;
  expandedSheetHeight: number;
  onFavoritePress?: (event: NativeSyntheticEvent<{ locationId: number; slug: string }>) => void;
  onMenuToggle?: (event: NativeSyntheticEvent<{ expanded: boolean }>) => void;
  onPlaceSelect?: (event: NativeSyntheticEvent<{ locationId: number; slug: string }>) => void;
  places: CurrentHappyHourPlace[];
  style?: StyleProp<ViewStyle>;
  theme: 'dark' | 'light';
  userLatitude?: number | null;
  userLongitude?: number | null;
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

function getNativeCurrentHappyHoursUpMenuStyle(bottomOffset: number, expanded: boolean, expandedSheetHeight: number): StyleProp<ViewStyle> {
  const reservedHeight = expanded ? expandedSheetHeight : Math.max(bottomOffset + 52, 132);

  return {
    bottom: 0,
    height: reservedHeight,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 60,
  };
}

export function NativeIOSCurrentHappyHoursUpMenu({
  bottomOffset,
  expanded,
  onSelectPlace,
  onFavoritePlace,
  onToggle,
  places,
  theme,
  userCoordinates,
}: CurrentHappyHoursUpMenuProps) {
  if (places.length === 0 || !isNativeIOSCurrentHappyHoursUpMenuAvailable()) {
    return null;
  }

  const expandedSheetHeight = Math.min(
    Math.max(Math.round(Dimensions.get('window').height * 0.82), 520),
    640,
  );

  return (
    <NativeCurrentHappyHoursUpMenuView
      bottomOffset={bottomOffset}
      expanded={expanded}
      expandedSheetHeight={expandedSheetHeight}
      onFavoritePress={(event) => onFavoritePlace?.(event.nativeEvent)}
      onMenuToggle={() => onToggle()}
      onPlaceSelect={(event) => onSelectPlace(event.nativeEvent)}
      places={places}
      style={getNativeCurrentHappyHoursUpMenuStyle(bottomOffset, expanded, expandedSheetHeight)}
      theme={theme}
      userLatitude={userCoordinates?.latitude ?? null}
      userLongitude={userCoordinates?.longitude ?? null}
    />
  );
}
