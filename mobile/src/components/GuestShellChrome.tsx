import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Easing, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AuthPortal } from '../appFlowTypes';
import { styles } from '../appStyles';
import { NativeIOSLiquidGlassBottomNav, NativeIOSLiquidGlassHeaderButton, isNativeIOSLiquidGlassBottomNavAvailable, isNativeIOSLiquidGlassHeaderButtonAvailable } from './NativeIOSLiquidGlass';

type AnimatedNumber = Animated.Value | Animated.AnimatedInterpolation<number> | number;

type GuestShellChromeProps = {
  actionOpacity?: AnimatedNumber;
  actionTranslateY?: AnimatedNumber;
  headerOpacity?: AnimatedNumber;
  interactive?: boolean;
  logoEntranceOpacity?: AnimatedNumber;
  logoEntranceScale?: AnimatedNumber;
  logoScale?: AnimatedNumber;
  logoTranslateY?: AnimatedNumber;
  onCreateAccount: () => void;
  onSelectPortal: (portal: AuthPortal) => void;
  showHeader?: boolean;
  showLogo?: boolean;
  themeVariant?: 'default-dark' | 'map-dark' | 'map-light';
};

export function GuestShellChrome({
  actionOpacity = 1,
  actionTranslateY = 0,
  headerOpacity = 1,
  interactive = true,
  logoEntranceOpacity = 1,
  logoEntranceScale = 1,
  logoScale = 0.5,
  logoTranslateY = 0,
  onCreateAccount,
  onSelectPortal,
  showHeader = true,
  showLogo = true,
  themeVariant = 'default-dark',
}: GuestShellChromeProps) {
  const insets = useSafeAreaInsets();
  const [activeModal, setActiveModal] = useState<'home-feed' | 'sign-in' | null>(null);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const touchTargetHitSlop = 12;
  const touchTargetPressRetentionOffset = 12;
  const shouldFloatHeaderControls = !showHeader && isNativeIOSLiquidGlassHeaderButtonAvailable();

  useEffect(() => {
    if (interactive || activeModal === null) {
      return;
    }

    modalOpacity.stopAnimation();
    modalOpacity.setValue(0);
    setActiveModal(null);
  }, [activeModal, interactive, modalOpacity]);

  function renderBottomNavIcon(icon: 'customer' | 'signup' | 'business', active: boolean) {
    const color = active ? '#fff8f1' : 'rgba(255, 248, 241, 0.68)';

    switch (icon) {
      case 'customer':
        return <Ionicons color={color} name={active ? 'person' : 'person-outline'} size={20} />;
      case 'signup':
        return <Ionicons color={color} name={active ? 'add-circle' : 'add-circle-outline'} size={20} />;
      case 'business':
        return <Ionicons color={color} name={active ? 'briefcase' : 'briefcase-outline'} size={20} />;
      default:
        return null;
    }
  }

  function openModal(modal: 'home-feed' | 'sign-in') {
    if (!interactive) {
      return;
    }

    setActiveModal(modal);
    modalOpacity.stopAnimation();
    modalOpacity.setValue(0);
    Animated.timing(modalOpacity, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }

  function closeModal() {
    modalOpacity.stopAnimation();
    Animated.timing(modalOpacity, {
      duration: 160,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setActiveModal(null);
      }
    });
  }

  function selectSignInPortal(portal: AuthPortal) {
    modalOpacity.stopAnimation();
    modalOpacity.setValue(0);
    setActiveModal(null);
    onSelectPortal(portal);
  }

  function selectCreateAccount() {
    modalOpacity.stopAnimation();
    modalOpacity.setValue(0);
    setActiveModal(null);
    onCreateAccount();
  }

  const homeFeedFallback = (
    <Pressable
      accessibilityLabel="Open Home Feed"
      accessibilityRole="button"
      disabled={!interactive}
      hitSlop={touchTargetHitSlop}
      onPress={() => openModal('home-feed')}
      pressRetentionOffset={touchTargetPressRetentionOffset}
      style={styles.splashHeaderIconButton}
    >
      <Ionicons color="#f3f6fb" name="newspaper-outline" size={18} />
    </Pressable>
  );
  const signInFallback = (
    <Pressable
      accessibilityLabel="Sign in"
      disabled={!interactive}
      hitSlop={touchTargetHitSlop}
      onPress={() => openModal('sign-in')}
      pressRetentionOffset={touchTargetPressRetentionOffset}
      style={styles.splashHeaderIconButton}
    >
      <Ionicons color="#f3f6fb" name="person-circle-outline" size={19} />
    </Pressable>
  );
  const headerControls = (
    <View style={[styles.dashboardHeaderRow, styles.splashHeaderRow]}>
      {interactive ? (
        <NativeIOSLiquidGlassHeaderButton
          accessibilityLabel="Open Home Feed"
          fallback={homeFeedFallback}
          onPress={() => openModal('home-feed')}
          systemImage="newspaper.fill"
          style={{ marginTop: 8 }}
          themeVariant={themeVariant}
          variant="icon"
        />
      ) : homeFeedFallback}
      <View pointerEvents="none" style={styles.splashHeaderCenterSlot} />
      {interactive ? (
        <NativeIOSLiquidGlassHeaderButton
          accessibilityLabel="Sign in"
          fallback={signInFallback}
          onPress={() => openModal('sign-in')}
          systemImage="person.crop.circle"
          style={{ marginTop: 8 }}
          themeVariant={themeVariant}
          variant="icon"
        />
      ) : signInFallback}
    </View>
  );

  return (
    <View pointerEvents="box-none" style={styles.guestShellChrome}>
      {showHeader || !shouldFloatHeaderControls ? (
        <Animated.View
          pointerEvents={interactive ? 'auto' : 'none'}
          style={[
            styles.screenHeaderBar,
            styles.splashHeaderBar,
            { opacity: headerOpacity },
          ]}
        >
          {headerControls}
        </Animated.View>
      ) : interactive ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            left: 0,
            opacity: headerOpacity,
            position: 'absolute',
            right: 0,
            top: Math.max(insets.top, 14),
            zIndex: 81,
          }}
        >
          {headerControls}
        </Animated.View>
      ) : null}

      {showLogo ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.splashFloatingLogo,
            {
              opacity: logoEntranceOpacity,
              top: -10,
              transform: [{ translateY: logoTranslateY }, { scale: logoScale }, { scale: logoEntranceScale }],
            },
          ]}
        >
          <Image
            fadeDuration={0}
            resizeMode="contain"
            source={require('../../assets/DiningDealz-Logo-Transparent.png')}
            style={styles.splashLogoImage}
          />
        </Animated.View>
      ) : null}

      <View pointerEvents="box-none" style={styles.bottomNavOverlay}>
        {isNativeIOSLiquidGlassBottomNavAvailable() ? (
          <Animated.View
            style={{
              opacity: actionOpacity,
              transform: [{ translateY: actionTranslateY }],
            }}
          >
            <View
              pointerEvents="none"
              style={[
                styles.bottomNavNativeBackdrop,
                { height: Math.max(56, insets.bottom + 56) },
              ]}
            />
            <NativeIOSLiquidGlassBottomNav
              activeItem="map"
              bottomInset={insets.bottom}
              labels={{ map: 'Customer', profile: 'Sign Up', more: 'Business' }}
              onSelect={(item) => {
                if (!interactive) {
                  return;
                }

                if (item === 'map') {
                  onSelectPortal('customer');
                  return;
                }

                if (item === 'profile') {
                  onCreateAccount();
                  return;
                }

                onSelectPortal('business');
              }}
              style={{ width: '100%' }}
              systemImages={{ map: 'person.fill', profile: 'plus', more: 'briefcase' }}
              themeVariant={themeVariant}
            />
          </Animated.View>
        ) : (
          <Animated.View
            style={[
              styles.bottomNavShell,
              {
                opacity: actionOpacity,
                paddingBottom: Math.max(insets.bottom + 10, 14),
                transform: [{ translateY: actionTranslateY }],
              },
            ]}
          >
            <View pointerEvents="none" style={styles.bottomNavGlassHighlight} />
            <Pressable
              accessibilityLabel="Open customer login"
              disabled={!interactive}
              hitSlop={touchTargetHitSlop}
              onPress={() => onSelectPortal('customer')}
              pressRetentionOffset={touchTargetPressRetentionOffset}
              style={styles.bottomNavItem}
            >
              <View style={[styles.bottomNavItemIconWrap, styles.bottomNavItemIconWrapActive]}>
                {renderBottomNavIcon('customer', true)}
              </View>
              <Text style={[styles.bottomNavItemLabel, styles.bottomNavItemLabelActive]}>Customer</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Create a free account"
              disabled={!interactive}
              hitSlop={touchTargetHitSlop}
              onPress={onCreateAccount}
              pressRetentionOffset={touchTargetPressRetentionOffset}
              style={styles.bottomNavItem}
            >
              <View style={styles.bottomNavItemIconWrap}>
                {renderBottomNavIcon('signup', false)}
              </View>
              <Text style={styles.bottomNavItemLabel}>Sign Up</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Open business login"
              disabled={!interactive}
              hitSlop={touchTargetHitSlop}
              onPress={() => onSelectPortal('business')}
              pressRetentionOffset={touchTargetPressRetentionOffset}
              style={styles.bottomNavItem}
            >
              <View style={styles.bottomNavItemIconWrap}>
                {renderBottomNavIcon('business', false)}
              </View>
              <Text style={styles.bottomNavItemLabel}>Business</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>

      {interactive && activeModal ? (
        <Animated.View pointerEvents="box-none" style={[styles.splashSignInOverlay, { opacity: modalOpacity }]}>
          <Pressable
            accessibilityLabel={activeModal === 'home-feed' ? 'Close Home Feed message' : 'Close sign in menu'}
            hitSlop={touchTargetHitSlop}
            onPress={closeModal}
            pressRetentionOffset={touchTargetPressRetentionOffset}
            style={styles.splashSignInModalBackdropPressable}
          />
          <View style={styles.splashSignInModalCardWrap}>
            <View style={styles.splashSignInModalCard}>
              <View style={styles.splashSignInModalHeader}>
                <View style={styles.splashSignInModalHeaderSpacer} />
                <Pressable
                  accessibilityLabel={activeModal === 'home-feed' ? 'Close Home Feed message' : 'Close sign in menu'}
                  accessibilityRole="button"
                  hitSlop={touchTargetHitSlop}
                  onPress={closeModal}
                  pressRetentionOffset={touchTargetPressRetentionOffset}
                  style={styles.splashSignInModalCloseButton}
                >
                  <Text style={styles.splashSignInModalCloseButtonText}>X</Text>
                </Pressable>
              </View>
              {activeModal === 'home-feed' ? (
                <>
                  <Text style={styles.splashSignInModalTitle}>Coming Soon</Text>
                  <Text style={styles.splashSignInModalText}>The DiningDealz Home Feed is on the way.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.splashSignInModalTitle}>Choose your login screen</Text>
                  <Text style={styles.splashSignInModalText}>Select where you want to sign in, or create a free account to get started.</Text>
                  <View style={styles.splashSignInModalActions}>
                    <Pressable
                      hitSlop={touchTargetHitSlop}
                      onPress={() => selectSignInPortal('customer')}
                      pressRetentionOffset={touchTargetPressRetentionOffset}
                      style={styles.splashSignInPrimaryButton}
                    >
                      <Text style={styles.splashSignInPrimaryButtonText}>Customer</Text>
                    </Pressable>
                    <Pressable
                      hitSlop={touchTargetHitSlop}
                      onPress={() => selectSignInPortal('business')}
                      pressRetentionOffset={touchTargetPressRetentionOffset}
                      style={styles.splashSignInSecondaryButton}
                    >
                      <Text style={styles.splashSignInSecondaryButtonText}>Business</Text>
                    </Pressable>
                    <Pressable
                      hitSlop={touchTargetHitSlop}
                      onPress={selectCreateAccount}
                      pressRetentionOffset={touchTargetPressRetentionOffset}
                      style={styles.splashSignInTertiaryButton}
                    >
                      <Text style={styles.splashSignInTertiaryButtonText}>Create Free Account</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}