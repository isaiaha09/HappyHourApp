import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from '../appStyles';
import type { AuthPortal } from '../appFlowTypes';
import { venueFilters } from '../browseConfig';
import { HomeFeedScreen } from './HomeFeedScreen';

const sloganWords = ['Discover.', 'Eat.', 'Save.'] as const;
let splashIntroState: 'unplayed' | 'playing' | 'played' = 'unplayed';

type SplashScreenProps = {
  apiBaseUrl: string;
  onCreateAccount: () => void;
  onOpenMap: () => void;
  onSelectPortal: (portal: AuthPortal) => void;
};

export function SplashScreen({ apiBaseUrl, onCreateAccount, onOpenMap, onSelectPortal }: SplashScreenProps) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const [signInModalMounted, setSignInModalMounted] = useState(false);
  const signInModalOpacity = useRef(new Animated.Value(0)).current;
  const timeline = useRef(new Animated.Value(splashIntroState === 'unplayed' ? 0 : 1)).current;
  const logoEntranceOpacity = useRef(new Animated.Value(splashIntroState === 'unplayed' ? 0 : 1)).current;
  const logoEntranceScale = useRef(new Animated.Value(splashIntroState === 'unplayed' ? 0.5 : 1)).current;
  const hasStartedAnimationRef = useRef(false);

  useEffect(() => {
    if (splashIntroState !== 'unplayed') {
      hasStartedAnimationRef.current = true;
      timeline.setValue(1);
      logoEntranceOpacity.setValue(1);
      logoEntranceScale.setValue(1);
      return;
    }

    if (hasStartedAnimationRef.current) {
      return;
    }

    hasStartedAnimationRef.current = true;
    splashIntroState = 'playing';
    timeline.setValue(0);
    logoEntranceOpacity.setValue(0);
    logoEntranceScale.setValue(0.5);
    const introFailSafeTimer = setTimeout(() => {
      splashIntroState = 'played';
      timeline.stopAnimation();
      logoEntranceOpacity.stopAnimation();
      logoEntranceScale.stopAnimation();
      timeline.setValue(1);
      logoEntranceOpacity.setValue(1);
      logoEntranceScale.setValue(1);
    }, 5200);
    Animated.parallel([
      Animated.timing(logoEntranceOpacity, {
        duration: 900,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(logoEntranceScale, {
        duration: 900,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(timeline, {
          duration: 420,
          easing: Easing.out(Easing.cubic),
          toValue: 0.16,
          useNativeDriver: true,
        }),
        Animated.delay(0),
        Animated.timing(timeline, {
          duration: 3600,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      clearTimeout(introFailSafeTimer);
      if (finished) {
        splashIntroState = 'played';
        return;
      }

      splashIntroState = 'played';
      timeline.setValue(1);
      logoEntranceOpacity.setValue(1);
      logoEntranceScale.setValue(1);
    });

    return () => {
      clearTimeout(introFailSafeTimer);
    };
  }, [logoEntranceOpacity, logoEntranceScale, timeline]);

  const logoTravelStart = Math.max(height * 0.24, 150);
  const logoFinalTop = -10;

  const headerOpacity = timeline.interpolate({
    inputRange: [0.34, 0.48, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const logoTranslateY = timeline.interpolate({
    inputRange: [0, 0.16, 0.36, 0.58, 1],
    outputRange: [logoTravelStart, logoTravelStart, logoTravelStart, 0, 0],
    extrapolate: 'clamp',
  });
  const logoScale = timeline.interpolate({
    inputRange: [0, 0.16, 0.36, 0.58, 1],
    outputRange: [1.22, 1.22, 1.22, 0.5, 0.5],
    extrapolate: 'clamp',
  });
  const sloganBlockOpacity = timeline.interpolate({
    inputRange: [0.5, 0.75, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const sloganBlockTranslateY = timeline.interpolate({
    inputRange: [0.5, 0.75, 1],
    outputRange: [0, 0, 0],
    extrapolate: 'clamp',
  });
  const sloganOpacities = [
    timeline.interpolate({
      inputRange: [0.56, 0.7, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
    timeline.interpolate({
      inputRange: [0.7, 0.84, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
    timeline.interpolate({
      inputRange: [0.84, 0.98, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
  ] as const;
  const feedOpacity = timeline.interpolate({
    inputRange: [0.82, 0.94, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const feedTranslateY = timeline.interpolate({
    inputRange: [0.82, 0.94, 1],
    outputRange: [18, 0, 0],
    extrapolate: 'clamp',
  });
  const actionOpacity = timeline.interpolate({
    inputRange: [0.9, 0.98, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const actionTranslateY = timeline.interpolate({
    inputRange: [0.9, 0.98, 1],
    outputRange: [18, 0, 0],
    extrapolate: 'clamp',
  });
  const homeBottomNavHeight = Math.max(insets.bottom + 76, 90);

  function renderHomeBottomNavIcon(icon: 'customer' | 'signup' | 'business', active: boolean) {
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

  function handleOpenSignInModal() {
    setSignInModalMounted(true);
    signInModalOpacity.stopAnimation();
    signInModalOpacity.setValue(0);
    Animated.timing(signInModalOpacity, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }

  function handleCloseSignInModal() {
    signInModalOpacity.stopAnimation();
    Animated.timing(signInModalOpacity, {
      duration: 160,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSignInModalMounted(false);
      }
    });
  }

  function handleSelectSignInPortal(portal: AuthPortal) {
    signInModalOpacity.stopAnimation();
    signInModalOpacity.setValue(0);
    setSignInModalMounted(false);
    onSelectPortal(portal);
  }

  function handleSelectCreateAccount() {
    signInModalOpacity.stopAnimation();
    signInModalOpacity.setValue(0);
    setSignInModalMounted(false);
    onCreateAccount();
  }

  return (
    <View style={styles.splashScreen}>
      <Animated.View
        style={[
          styles.screenHeaderBar,
          styles.splashHeaderBar,
          {
            opacity: headerOpacity,
          },
        ]}
      >
        <View style={styles.screenHeaderBarRow}>
          <Pressable onPress={onOpenMap} style={[styles.backButton, styles.splashHeaderBackButton]}>
            <Text style={styles.backButtonText}>Open Map</Text>
          </Pressable>
          <View pointerEvents="none" style={styles.splashHeaderCenterSlot} />
          <Pressable onPress={handleOpenSignInModal} style={styles.splashHeaderSignInButton}>
            <Text style={styles.splashHeaderSignInText}>Sign in</Text>
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.splashFloatingLogo,
          {
            opacity: logoEntranceOpacity,
            top: logoFinalTop,
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

      <View style={styles.splashBody}>
        <HomeFeedScreen
          apiBaseUrl={apiBaseUrl}
          feedAnimatedStyle={{
            opacity: feedOpacity,
            transform: [{ translateY: feedTranslateY }],
          }}
          footerContent={<View style={{ height: homeBottomNavHeight + 16 }} />}
          headerContent={(
            <View style={styles.splashScrollHeaderContent}>
              <View style={styles.splashScrollHeroSpacer} />
              <Animated.View
                style={[
                  styles.splashSloganBlock,
                  {
                    opacity: sloganBlockOpacity,
                    transform: [{ translateY: sloganBlockTranslateY }],
                  },
                ]}
              >
                <View style={styles.splashSloganRow}>
                  {sloganWords.map((word, index) => (
                    <Animated.Text
                      key={word}
                      style={[styles.splashSloganWord, { opacity: sloganOpacities[index] }]}
                    >
                      {word}
                    </Animated.Text>
                  ))}
                </View>
              </Animated.View>
            </View>
          )}
          isLandscape={isLandscape}
          reloadToken={0}
          searchQuery=""
          selectedCity="all"
          selectedVenueTypes={venueFilters.map((filter) => filter.value)}
        />
      </View>

      <View pointerEvents="box-none" style={styles.bottomNavOverlay}>
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
              {renderHomeBottomNavIcon('customer', true)}
            </View>
            <Text style={[styles.bottomNavItemLabel, styles.bottomNavItemLabelActive]}>Customer</Text>
          </Pressable>
          <Pressable accessibilityLabel="Create a free account" onPress={onCreateAccount} style={styles.bottomNavItem}>
            <View style={styles.bottomNavItemIconWrap}>
              {renderHomeBottomNavIcon('signup', false)}
            </View>
            <Text style={styles.bottomNavItemLabel}>Sign Up</Text>
          </Pressable>
          <Pressable accessibilityLabel="Open business login" onPress={() => onSelectPortal('business')} style={styles.bottomNavItem}>
            <View style={styles.bottomNavItemIconWrap}>
              {renderHomeBottomNavIcon('business', false)}
            </View>
            <Text style={styles.bottomNavItemLabel}>Business</Text>
          </Pressable>
        </Animated.View>
      </View>

      {signInModalMounted ? (
        <Animated.View pointerEvents="box-none" style={[styles.splashSignInOverlay, { opacity: signInModalOpacity }]}>
          <Pressable onPress={handleCloseSignInModal} style={styles.splashSignInModalBackdropPressable} />
          <View style={styles.splashSignInModalCardWrap}>
            <View style={styles.splashSignInModalCard}>
              <View style={styles.splashSignInModalHeader}>
                <View style={styles.splashSignInModalHeaderSpacer} />
                <Pressable onPress={handleCloseSignInModal} style={styles.splashSignInModalCloseButton}>
                  <Text style={styles.splashSignInModalCloseButtonText}>X</Text>
                </Pressable>
              </View>
              <Text style={styles.splashSignInModalTitle}>Choose your login screen</Text>
              <Text style={styles.splashSignInModalText}>Select where you want to sign in, or create a free account to get started.</Text>
              <View style={styles.splashSignInModalActions}>
                <Pressable onPress={() => handleSelectSignInPortal('customer')} style={styles.splashSignInPrimaryButton}>
                  <Text style={styles.splashSignInPrimaryButtonText}>Customer</Text>
                </Pressable>
                <Pressable onPress={() => handleSelectSignInPortal('business')} style={styles.splashSignInSecondaryButton}>
                  <Text style={styles.splashSignInSecondaryButtonText}>Business</Text>
                </Pressable>
                <Pressable onPress={handleSelectCreateAccount} style={styles.splashSignInTertiaryButton}>
                  <Text style={styles.splashSignInTertiaryButtonText}>Create Free Account</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
