import type { ReactNode } from 'react';
import { Platform, Pressable, Text, UIManager, requireNativeComponent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';

import { styles } from '../appStyles';

export type NativeLiquidGlassBottomNavItem = 'map' | 'profile' | 'more';

type NativeLiquidGlassBottomNavLabels = Partial<Record<NativeLiquidGlassBottomNavItem, string>>;
type NativeLiquidGlassBottomNavSystemImages = Partial<Record<NativeLiquidGlassBottomNavItem, string>>;

type NativeBottomNavSelectEvent = NativeSyntheticEvent<{
  item: NativeLiquidGlassBottomNavItem;
}>;

type NativeHeaderButtonPressEvent = NativeSyntheticEvent<Record<string, never>>;

type NativeBottomNavViewProps = {
  activeItem: NativeLiquidGlassBottomNavItem;
  bottomInset: number;
  mapLabel?: string;
  mapSystemImage?: string;
  moreOpen?: boolean;
  moreLabel?: string;
  moreSystemImage?: string;
  onNavItemSelect?: (event: NativeBottomNavSelectEvent) => void;
  profileLabel?: string;
  profileSystemImage?: string;
  style?: StyleProp<ViewStyle>;
};

type NativeHeaderButtonViewProps = {
  accessibilityLabel?: string;
  label?: string;
  onGlassButtonPress?: (event: NativeHeaderButtonPressEvent) => void;
  systemImage?: string;
  variant: 'pill' | 'icon';
  style?: StyleProp<ViewStyle>;
};

type NativeIOSLiquidGlassBottomNavProps = {
  activeItem: NativeLiquidGlassBottomNavItem;
  bottomInset: number;
  labels?: NativeLiquidGlassBottomNavLabels;
  moreOpen?: boolean;
  onSelect: (item: NativeLiquidGlassBottomNavItem) => void;
  systemImages?: NativeLiquidGlassBottomNavSystemImages;
  style?: StyleProp<ViewStyle>;
};

type NativeIOSLiquidGlassHeaderButtonProps = {
  accessibilityLabel?: string;
  fallback: ReactNode;
  label?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  systemImage?: string;
  variant: 'pill' | 'icon';
};

type NativeIOSLiquidGlassBackButtonProps = {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const nativeBottomNavViewName = 'DiningDealzLiquidGlassBottomNavView';
const nativeHeaderButtonViewName = 'DiningDealzLiquidGlassHeaderButtonView';
const minimumIOSLiquidGlassVersion = 26;

const NativeBottomNavView = requireNativeComponent<NativeBottomNavViewProps>(nativeBottomNavViewName);
const NativeHeaderButtonView = requireNativeComponent<NativeHeaderButtonViewProps>(nativeHeaderButtonViewName);

function isSupportedIOSLiquidGlassRuntime() {
  if (Platform.OS !== 'ios') {
    return false;
  }

  const iosVersion = typeof Platform.Version === 'string'
    ? Number.parseInt(Platform.Version, 10)
    : Platform.Version;

  return Number.isFinite(iosVersion) && iosVersion >= minimumIOSLiquidGlassVersion;
}

function hasNativeViewManager(viewName: string) {
  if (!isSupportedIOSLiquidGlassRuntime()) {
    return false;
  }

  const nativeUIManager = UIManager as typeof UIManager & {
    [key: string]: unknown;
    hasViewManagerConfig?: (name: string) => boolean;
  };
  const getViewManagerConfig = nativeUIManager.getViewManagerConfig?.bind(nativeUIManager);

  if (nativeUIManager.hasViewManagerConfig?.(viewName)) {
    return true;
  }

  if (getViewManagerConfig?.(viewName) || getViewManagerConfig?.(`${viewName}Manager`)) {
    return true;
  }

  return Boolean(nativeUIManager[viewName] || nativeUIManager[`${viewName}Manager`]);
}

function getBottomNavStyle(bottomInset: number, style?: StyleProp<ViewStyle>) {
  return [{ width: '100%' as const, height: Math.max(90, 82 + bottomInset) }, style];
}

function getHeaderButtonStyle(variant: 'pill' | 'icon', label?: string, style?: StyleProp<ViewStyle>) {
  if (variant === 'icon') {
    return [{ width: 38, height: 38 }, style];
  }

  const resolvedLabel = label?.trim() ?? '';
  const width = Math.max(92, resolvedLabel.length * 9.5 + 38);
  return [{ width, height: 38 }, style];
}

export function isNativeIOSLiquidGlassBottomNavAvailable() {
  return hasNativeViewManager(nativeBottomNavViewName);
}

export function isNativeIOSLiquidGlassHeaderButtonAvailable() {
  return hasNativeViewManager(nativeHeaderButtonViewName);
}

export function NativeIOSLiquidGlassBottomNav({ activeItem, bottomInset, labels, moreOpen = false, onSelect, style, systemImages }: NativeIOSLiquidGlassBottomNavProps) {
  if (!isNativeIOSLiquidGlassBottomNavAvailable()) {
    return null;
  }

  return (
    <NativeBottomNavView
      activeItem={activeItem}
      bottomInset={bottomInset}
      mapLabel={labels?.map}
      mapSystemImage={systemImages?.map}
      moreOpen={moreOpen}
      moreLabel={labels?.more}
      moreSystemImage={systemImages?.more}
      onNavItemSelect={(event) => onSelect(event.nativeEvent.item)}
      profileLabel={labels?.profile}
      profileSystemImage={systemImages?.profile}
      style={getBottomNavStyle(bottomInset, style)}
    />
  );
}

export function NativeIOSLiquidGlassHeaderButton({ accessibilityLabel, fallback, label, onPress, style, systemImage, variant }: NativeIOSLiquidGlassHeaderButtonProps) {
  if (!isNativeIOSLiquidGlassHeaderButtonAvailable()) {
    return <>{fallback}</>;
  }

  return (
    <NativeHeaderButtonView
      accessibilityLabel={accessibilityLabel}
      label={label}
      onGlassButtonPress={() => onPress()}
      style={getHeaderButtonStyle(variant, label, style)}
      systemImage={systemImage}
      variant={variant}
    />
  );
}

export function NativeIOSLiquidGlassBackButton({ label, onPress, style }: NativeIOSLiquidGlassBackButtonProps) {
  return (
    <NativeIOSLiquidGlassHeaderButton
      fallback={(
        <Pressable onPress={onPress} style={[styles.backButton, style]}>
          <Text style={styles.backButtonText}>{label}</Text>
        </Pressable>
      )}
      label={label}
      onPress={onPress}
      style={style}
      variant="pill"
    />
  );
}