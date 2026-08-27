import {
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
  onMenuToggle?: (event: NativeSyntheticEvent<{ expanded: boolean }>) => void;
  onPlaceSelect?: (event: NativeSyntheticEvent<{ locationId: number; slug: string }>) => void;
  places: CurrentHappyHourPlace[];
  style?: StyleProp<ViewStyle>;
  theme: 'dark' | 'light';
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

function getNativeCurrentHappyHoursUpMenuStyle(bottomOffset: number, expanded: boolean): StyleProp<ViewStyle> {
  const reservedHeight = expanded ? 460 : 64;

  return {
    bottom: Math.max(bottomOffset, 0),
    height: reservedHeight,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 81,
  };
}

export function NativeIOSCurrentHappyHoursUpMenu({
  bottomOffset,
  expanded,
  onSelectPlace,
  onToggle,
  places,
  theme,
}: CurrentHappyHoursUpMenuProps) {
  if (places.length === 0 || !isNativeIOSCurrentHappyHoursUpMenuAvailable()) {
    return null;
  }

  return (
    <NativeCurrentHappyHoursUpMenuView
      bottomOffset={0}
      expanded={expanded}
      onMenuToggle={() => onToggle()}
      onPlaceSelect={(event) => onSelectPlace(event.nativeEvent)}
      places={places}
      style={getNativeCurrentHappyHoursUpMenuStyle(bottomOffset, expanded)}
      theme={theme}
    />
  );
}
