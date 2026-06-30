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
  onSelect?: (event: NativeBottomNavSelectEvent) => void;
  style?: StyleProp<ViewStyle>;
};

type NativeHeaderButtonViewProps = {
  accessibilityLabel?: string;
  label?: string;
  onPress?: (event: NativeHeaderButtonPressEvent) => void;
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

  const getViewManagerConfig = UIManager.getViewManagerConfig?.bind(UIManager);
  return Boolean(getViewManagerConfig?.(viewName));
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
      onSelect={(event) => onSelect(event.nativeEvent.item)}
      style={style}
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
      onPress={() => onPress()}
      style={style}
      systemImage={systemImage}
      variant={variant}
    />
  );
}