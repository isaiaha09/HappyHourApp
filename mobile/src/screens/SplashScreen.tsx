import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const timeline = useRef(new Animated.Value(splashIntroState === 'unplayed' ? 0 : 1)).current;
  const hasStartedAnimationRef = useRef(false);

  useEffect(() => {
    if (splashIntroState !== 'unplayed') {
      hasStartedAnimationRef.current = true;
      return;
    }

    if (hasStartedAnimationRef.current) {
      return;
    }

    hasStartedAnimationRef.current = true;
    splashIntroState = 'playing';
    timeline.setValue(0);
    Animated.sequence([
      Animated.timing(timeline, {
        duration: 200,
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
    ]).start(({ finished }) => {
      if (finished) {
        splashIntroState = 'played';
        return;
      }

      splashIntroState = 'playing';
    });
  }, [timeline]);

  const logoTravelStart = Math.max(height * 0.24, 150);
  const logoFinalTop = -31.5;

  const headerOpacity = timeline.interpolate({
    inputRange: [0.34, 0.48, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const logoOpacity = timeline.interpolate({
    inputRange: [0, 0.16, 1],
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
    outputRange: [1.22, 1.22, 1.22, 0.35, 0.35],
    extrapolate: 'clamp',
  });
  const sloganBlockOpacity = timeline.interpolate({
    inputRange: [0.62, 0.74, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const sloganBlockTranslateY = timeline.interpolate({
    inputRange: [0.62, 0.74, 1],
    outputRange: [16, 0, 0],
    extrapolate: 'clamp',
  });
  const sloganOpacities = [
    timeline.interpolate({
      inputRange: [0.66, 0.76, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
    timeline.interpolate({
      inputRange: [0.74, 0.84, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
    timeline.interpolate({
      inputRange: [0.82, 0.92, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
  ] as const;
  const actionOpacity = timeline.interpolate({
    inputRange: [0.72, 0.84, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const actionTranslateY = timeline.interpolate({
    inputRange: [0.72, 0.84, 1],
    outputRange: [18, 0, 0],
    extrapolate: 'clamp',
  });

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
          <View pointerEvents="none" style={styles.splashHeaderRightSpacer} />
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.splashFloatingLogo,
          {
            opacity: logoOpacity,
            top: logoFinalTop,
            transform: [{ translateY: logoTranslateY }, { scale: logoScale }],
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
    </View>
  );
}
