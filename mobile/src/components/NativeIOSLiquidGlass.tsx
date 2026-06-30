import type { ReactNode } from 'react';
import { Platform, UIManager, requireNativeComponent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';

export type NativeLiquidGlassBottomNavItem = 'map' | 'profile' | 'more';

type NativeBottomNavSelectEvent = NativeSyntheticEvent<{
  item: NativeLiquidGlassBottomNavItem;
}>;

type NativeHeaderButtonPressEvent = NativeSyntheticEvent<Record<string, never>>;

type NativeBottomNavViewProps = {
  activeItem: NativeLiquidGlassBottomNavItem;
  bottomInset: number;
  moreOpen?: boolean;
  onNavItemSelect?: (event: NativeBottomNavSelectEvent) => void;
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
  moreOpen?: boolean;
  onSelect: (item: NativeLiquidGlassBottomNavItem) => void;
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

const nativeBottomNavViewName = 'DiningDealzLiquidGlassBottomNavView';
const nativeHeaderButtonViewName = 'DiningDealzLiquidGlassHeaderButtonView';

const NativeBottomNavView = requireNativeComponent<NativeBottomNavViewProps>(nativeBottomNavViewName);
const NativeHeaderButtonView = requireNativeComponent<NativeHeaderButtonViewProps>(nativeHeaderButtonViewName);

function hasNativeViewManager(viewName: string) {
  if (Platform.OS !== 'ios') {
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
    return [{ width: 44, height: 44 }, style];
  }

  const resolvedLabel = label?.trim() ?? '';
  const width = Math.max(88, resolvedLabel.length * 9 + 32);
  return [{ width, height: 44 }, style];
}

export function isNativeIOSLiquidGlassBottomNavAvailable() {
  return hasNativeViewManager(nativeBottomNavViewName);
}

export function isNativeIOSLiquidGlassHeaderButtonAvailable() {
  return hasNativeViewManager(nativeHeaderButtonViewName);
}

export function NativeIOSLiquidGlassBottomNav({ activeItem, bottomInset, moreOpen = false, onSelect, style }: NativeIOSLiquidGlassBottomNavProps) {
  if (!isNativeIOSLiquidGlassBottomNavAvailable()) {
    return null;
  }

  return (
    <NativeBottomNavView
      activeItem={activeItem}
      bottomInset={bottomInset}
      moreOpen={moreOpen}
      onNavItemSelect={(event) => onSelect(event.nativeEvent.item)}
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