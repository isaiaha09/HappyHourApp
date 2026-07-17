import type { ReactNode } from 'react';
import { Platform, Pressable, Text, UIManager, requireNativeComponent, type NativeSyntheticEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { styles } from '../appStyles';

export type NativeLiquidGlassBottomNavItem = 'home' | 'map' | 'profile' | 'more';

type NativeLiquidGlassBottomNavLabels = Partial<Record<NativeLiquidGlassBottomNavItem, string>>;
type NativeLiquidGlassBottomNavSystemImages = Partial<Record<NativeLiquidGlassBottomNavItem, string>>;

type NativeBottomNavSelectEvent = NativeSyntheticEvent<{
  item: NativeLiquidGlassBottomNavItem;
}>;

type NativeHeaderButtonPressEvent = NativeSyntheticEvent<Record<string, never>>;

type NativeBottomNavViewProps = {
  activeItem: NativeLiquidGlassBottomNavItem;
  bottomInset: number;
  homeLabel?: string;
  homeSystemImage?: string;
  includeHomeItem?: boolean;
  mapLabel?: string;
  mapSystemImage?: string;
  moreOpen?: boolean;
  moreLabel?: string;
  moreSystemImage?: string;
  onNavItemSelect?: (event: NativeBottomNavSelectEvent) => void;
  profileLabel?: string;
  profileSystemImage?: string;
  style?: StyleProp<ViewStyle>;
  themeVariant?: 'default-dark' | 'map-dark' | 'map-light';
};

type NativeHeaderButtonViewProps = {
  accessibilityLabel?: string;
  label?: string;
  onGlassButtonPress?: (event: NativeHeaderButtonPressEvent) => void;
  systemImage?: string;
  variant: 'pill' | 'icon';
  style?: StyleProp<ViewStyle>;
  themeVariant?: 'default-dark' | 'map-dark' | 'map-light';
};

type NativeIOSLiquidGlassBottomNavProps = {
  activeItem: NativeLiquidGlassBottomNavItem;
  bottomInset: number;
  includeHomeItem?: boolean;
  labels?: NativeLiquidGlassBottomNavLabels;
  moreOpen?: boolean;
  onSelect: (item: NativeLiquidGlassBottomNavItem) => void;
  systemImages?: NativeLiquidGlassBottomNavSystemImages;
  style?: StyleProp<ViewStyle>;
  themeVariant?: 'default-dark' | 'map-dark' | 'map-light';
};

type NativeIOSLiquidGlassHeaderButtonProps = {
  accessibilityLabel?: string;
  fallback: ReactNode;
  hideFallbackWhenNativeUnavailable?: boolean;
  label?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  systemImage?: string;
  themeVariant?: 'default-dark' | 'map-dark' | 'map-light';
  variant: 'pill' | 'icon';
};

type NativeIOSLiquidGlassBackButtonProps = {
  forceFallback?: boolean;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  themeVariant?: 'default-dark' | 'map-dark' | 'map-light';
};

const nativeBottomNavViewName = 'DiningDealzLiquidGlassBottomNavView';
const nativeHeaderButtonViewName = 'DiningDealzLiquidGlassHeaderButtonView';
const minimumIOSLiquidGlassVersion = 26;
const headerIconButtonSize = 40;
const headerPillButtonHeight = 44;
const headerPillHorizontalPadding = 28;
const averageHeaderPillCharacterWidth = 7;

const NativeBottomNavView = requireNativeComponent<NativeBottomNavViewProps>(nativeBottomNavViewName);
const NativeHeaderButtonView = requireNativeComponent<NativeHeaderButtonViewProps>(nativeHeaderButtonViewName);

export function isSupportedIOSLiquidGlassRuntime() {
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
  return [{ width: '100%' as const, backgroundColor: 'transparent', height: Math.max(52 + bottomInset, 52), overflow: 'visible' as const }, style];
}

function getHeaderButtonStyle(variant: 'pill' | 'icon', label?: string, style?: StyleProp<ViewStyle>) {
  if (variant === 'icon') {
    return [{ width: headerIconButtonSize, height: headerIconButtonSize }, style];
  }

  const resolvedLabel = label?.trim() ?? '';
  const width = Math.max(headerPillButtonHeight, Math.ceil(resolvedLabel.length * averageHeaderPillCharacterWidth + headerPillHorizontalPadding));
  return [{ width, height: headerPillButtonHeight }, style];
}

export function isNativeIOSLiquidGlassBottomNavAvailable() {
  return hasNativeViewManager(nativeBottomNavViewName);
}

export function isNativeIOSLiquidGlassHeaderButtonAvailable() {
  return hasNativeViewManager(nativeHeaderButtonViewName);
}

export function NativeIOSLiquidGlassBottomNav({ activeItem, bottomInset, includeHomeItem = false, labels, moreOpen = false, onSelect, style, systemImages, themeVariant = 'default-dark' }: NativeIOSLiquidGlassBottomNavProps) {
  if (!isNativeIOSLiquidGlassBottomNavAvailable()) {
    return null;
  }

  return (
    <NativeBottomNavView
      activeItem={activeItem}
      bottomInset={bottomInset}
      homeLabel={labels?.home}
      homeSystemImage={systemImages?.home}
      includeHomeItem={includeHomeItem}
      mapLabel={labels?.map}
      mapSystemImage={systemImages?.map}
      moreOpen={moreOpen}
      moreLabel={labels?.more}
      moreSystemImage={systemImages?.more}
      onNavItemSelect={(event) => onSelect(event.nativeEvent.item)}
      profileLabel={labels?.profile}
      profileSystemImage={systemImages?.profile}
      style={getBottomNavStyle(bottomInset, style)}
      themeVariant={themeVariant}
    />
  );
}

export function NativeIOSLiquidGlassHeaderButton({ accessibilityLabel, fallback, hideFallbackWhenNativeUnavailable = false, label, onPress, style, systemImage, themeVariant = 'default-dark', variant }: NativeIOSLiquidGlassHeaderButtonProps) {
  if (!isNativeIOSLiquidGlassHeaderButtonAvailable()) {
    if (hideFallbackWhenNativeUnavailable && isSupportedIOSLiquidGlassRuntime()) {
      return null;
    }

    return <>{fallback}</>;
  }

  return (
    <NativeHeaderButtonView
      accessibilityLabel={accessibilityLabel}
      label={label}
      onGlassButtonPress={() => onPress()}
      style={getHeaderButtonStyle(variant, label, style)}
      systemImage={systemImage}
      themeVariant={themeVariant}
      variant={variant}
    />
  );
}

export function NativeIOSLiquidGlassBackButton({ forceFallback = false, label, onPress, style, textStyle, themeVariant = 'default-dark' }: NativeIOSLiquidGlassBackButtonProps) {
  const fallback = (
    <Pressable hitSlop={12} onPress={onPress} pressRetentionOffset={12} style={[styles.backButton, style]}>
      <Text style={[styles.backButtonText, textStyle]}>{label}</Text>
    </Pressable>
  );

  if (forceFallback) {
    return fallback;
  }

  return (
    <NativeIOSLiquidGlassHeaderButton
      fallback={fallback}
      label={label}
      onPress={onPress}
      style={style}
      themeVariant={themeVariant}
      variant="pill"
    />
  );
}
