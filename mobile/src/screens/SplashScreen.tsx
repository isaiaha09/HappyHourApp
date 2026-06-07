import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { styles } from '../appStyles';
import type { AuthPortal } from '../appFlowTypes';

const sloganWords = ['Discover.', 'Eat.', 'Save.'] as const;
let splashIntroState: 'unplayed' | 'playing' | 'played' = 'unplayed';

type SplashScreenProps = {
  onCreateAccount: () => void;
  onOpenMap: () => void;
  onSelectPortal: (portal: AuthPortal) => void;
};

export function SplashScreen({ onCreateAccount, onOpenMap, onSelectPortal }: SplashScreenProps) {
  const { height } = useWindowDimensions();
  const [signInModalVisible, setSignInModalVisible] = useState(false);
  const timeline = useRef(new Animated.Value(splashIntroState === 'unplayed' ? 0 : 1)).current;
  const logoEntranceOpacity = useRef(new Animated.Value(splashIntroState === 'unplayed' ? 0 : 1)).current;
  const logoEntranceScale = useRef(new Animated.Value(splashIntroState === 'unplayed' ? 0.5 : 1)).current;
  const hasStartedAnimationRef = useRef(false);

  useEffect(() => {
    if (splashIntroState !== 'unplayed') {
      hasStartedAnimationRef.current = true;
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
      if (finished) {
        splashIntroState = 'played';
        return;
      }

      splashIntroState = 'playing';
    });
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

  function handleOpenSignInModal() {
    setSignInModalVisible(true);
  }

  function handleCloseSignInModal() {
    setSignInModalVisible(false);
  }

  function handleSelectSignInPortal(portal: AuthPortal) {
    setSignInModalVisible(false);
    onSelectPortal(portal);
  }

  function handleSelectCreateAccount() {
    setSignInModalVisible(false);
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

        <Animated.View
          style={[
            styles.splashActionGroup,
            {
              opacity: actionOpacity,
              transform: [{ translateY: actionTranslateY }],
            },
          ]}
        >
          <View style={styles.modeRow}>
            <Pressable onPress={() => onSelectPortal('customer')} style={styles.splashPortalButton}>
              <Text style={styles.splashPortalButtonText}>Customer</Text>
            </Pressable>
            <Pressable onPress={() => onSelectPortal('business')} style={styles.splashPortalButton}>
              <Text style={styles.splashPortalButtonText}>Business</Text>
            </Pressable>
          </View>
          <Pressable onPress={onCreateAccount} style={styles.splashCreateAccountLink}>
            <Text style={styles.splashCreateAccountText}>Don&apos;t have an account? Create a free account here.</Text>
          </Pressable>
        </Animated.View>
      </View>

      {signInModalVisible ? (
        <View pointerEvents="box-none" style={styles.splashSignInOverlay}>
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
        </View>
      ) : null}
    </View>
  );
}
