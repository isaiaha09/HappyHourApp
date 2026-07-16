import { useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AuthPortal } from '../appFlowTypes';
import { styles } from '../appStyles';
import { NativeIOSLiquidGlassBottomNav, NativeIOSLiquidGlassHeaderButton, isNativeIOSLiquidGlassBottomNavAvailable } from './NativeIOSLiquidGlass';

type AnimatedNumber = Animated.Value | Animated.AnimatedInterpolation<number> | number;

type GuestShellChromeProps = {
  actionOpacity?: AnimatedNumber;
  actionTranslateY?: AnimatedNumber;
  headerOpacity?: AnimatedNumber;
  logoEntranceOpacity?: AnimatedNumber;
  logoEntranceScale?: AnimatedNumber;
  logoScale?: AnimatedNumber;
  logoTranslateY?: AnimatedNumber;
  onCreateAccount: () => void;
  onSelectPortal: (portal: AuthPortal) => void;
  showLogo?: boolean;
};

export function GuestShellChrome({
  actionOpacity = 1,
  actionTranslateY = 0,
  headerOpacity = 1,
  logoEntranceOpacity = 1,
  logoEntranceScale = 1,
  logoScale = 0.5,
  logoTranslateY = 0,
  onCreateAccount,
  onSelectPortal,
  showLogo = true,
}: GuestShellChromeProps) {
  const insets = useSafeAreaInsets();
  const [activeModal, setActiveModal] = useState<'home-feed' | 'sign-in' | null>(null);
  const modalOpacity = useRef(new Animated.Value(0)).current;

  function renderBottomNavIcon(icon: 'customer' | 'signup' | 'business', active: boolean) {
    switch (icon) {
      case 'customer':
        return (
          <View style={styles.bottomNavProfileIcon}>
            <View style={[styles.bottomNavProfileHead, active ? styles.bottomNavIconFillActive : null]} />
            <View style={[styles.bottomNavProfileBody, active ? styles.bottomNavIconStrokeActive : null]} />
          </View>
        );
      case 'signup':
        return (
          <View style={styles.bottomNavPlusIcon}>
            <View style={[styles.bottomNavPlusLineHorizontal, active ? styles.bottomNavIconFillActive : null]} />
            <View style={[styles.bottomNavPlusLineVertical, active ? styles.bottomNavIconFillActive : null]} />
          </View>
        );
      case 'business':
        return (
          <View style={styles.bottomNavBusinessIcon}>
            <View style={[styles.bottomNavBusinessHandle, active ? styles.bottomNavIconStrokeActive : null]} />
            <View style={[styles.bottomNavBusinessBody, active ? styles.bottomNavIconStrokeActive : null]} />
          </View>
        );
      default:
        return null;
    }
  }

  function openModal(modal: 'home-feed' | 'sign-in') {
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

  return (
    <View pointerEvents="box-none" style={styles.guestShellChrome}>
      <Animated.View
        style={[
          styles.screenHeaderBar,
          styles.splashHeaderBar,
          { opacity: headerOpacity },
        ]}
      >
        <View style={[styles.dashboardHeaderRow, styles.splashHeaderRow]}>
          <NativeIOSLiquidGlassHeaderButton
            accessibilityLabel="Open Home Feed"
            fallback={(
              <Pressable accessibilityLabel="Open Home Feed" accessibilityRole="button" onPress={() => openModal('home-feed')} style={[styles.backButton, styles.splashHeaderBackButton]}>
                <Text style={styles.backButtonText}>Home Feed</Text>
              </Pressable>
            )}
            label="Home Feed"
            onPress={() => openModal('home-feed')}
            style={{ marginTop: 8 }}
            variant="pill"
          />
          <View pointerEvents="none" style={styles.splashHeaderCenterSlot} />
          <NativeIOSLiquidGlassHeaderButton
            accessibilityLabel="Sign in"
            fallback={(
              <Pressable accessibilityLabel="Sign in" onPress={() => openModal('sign-in')} style={styles.splashHeaderSignInButton}>
                <Text style={styles.splashHeaderSignInText}>Sign in</Text>
              </Pressable>
            )}
            label="Sign in"
            onPress={() => openModal('sign-in')}
            style={{ marginTop: 8, width: 96 }}
            variant="pill"
          />
        </View>
      </Animated.View>

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
            <Pressable accessibilityLabel="Open customer login" onPress={() => onSelectPortal('customer')} style={styles.bottomNavItem}>
              <View style={[styles.bottomNavItemIconWrap, styles.bottomNavItemIconWrapActive]}>
                {renderBottomNavIcon('customer', true)}
              </View>
              <Text style={[styles.bottomNavItemLabel, styles.bottomNavItemLabelActive]}>Customer</Text>
            </Pressable>
            <Pressable accessibilityLabel="Create a free account" onPress={onCreateAccount} style={styles.bottomNavItem}>
              <View style={styles.bottomNavItemIconWrap}>
                {renderBottomNavIcon('signup', false)}
              </View>
              <Text style={styles.bottomNavItemLabel}>Sign Up</Text>
            </Pressable>
            <Pressable accessibilityLabel="Open business login" onPress={() => onSelectPortal('business')} style={styles.bottomNavItem}>
              <View style={styles.bottomNavItemIconWrap}>
                {renderBottomNavIcon('business', false)}
              </View>
              <Text style={styles.bottomNavItemLabel}>Business</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>

      {activeModal ? (
        <Animated.View pointerEvents="box-none" style={[styles.splashSignInOverlay, { opacity: modalOpacity }]}>
          <Pressable accessibilityLabel={activeModal === 'home-feed' ? 'Close Home Feed message' : 'Close sign in menu'} onPress={closeModal} style={styles.splashSignInModalBackdropPressable} />
          <View style={styles.splashSignInModalCardWrap}>
            <View style={styles.splashSignInModalCard}>
              <View style={styles.splashSignInModalHeader}>
                <View style={styles.splashSignInModalHeaderSpacer} />
                <Pressable
                  accessibilityLabel={activeModal === 'home-feed' ? 'Close Home Feed message' : 'Close sign in menu'}
                  accessibilityRole="button"
                  onPress={closeModal}
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
                    <Pressable onPress={() => selectSignInPortal('customer')} style={styles.splashSignInPrimaryButton}>
                      <Text style={styles.splashSignInPrimaryButtonText}>Customer</Text>
                    </Pressable>
                    <Pressable onPress={() => selectSignInPortal('business')} style={styles.splashSignInSecondaryButton}>
                      <Text style={styles.splashSignInSecondaryButtonText}>Business</Text>
                    </Pressable>
                    <Pressable onPress={selectCreateAccount} style={styles.splashSignInTertiaryButton}>
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