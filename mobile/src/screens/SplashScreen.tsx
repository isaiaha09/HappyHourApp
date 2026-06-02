import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { styles } from '../appStyles';
import type { AuthPortal } from '../appFlowTypes';

const sloganWords = ['Discover.', 'Eat.', 'Save.'] as const;

type BrandHeroProps = {
  animateSlogan?: boolean;
};

type SplashScreenProps = {
  onCreateAccount: () => void;
  onOpenMap: () => void;
  onSelectPortal: (portal: AuthPortal) => void;
};

export function BrandHero({ animateSlogan = false }: BrandHeroProps) {
  const timeline = useRef(new Animated.Value(animateSlogan ? 0 : 1)).current;
  const hasStartedAnimationRef = useRef(false);

  useEffect(() => {
    if (!animateSlogan) {
      timeline.setValue(1);
      hasStartedAnimationRef.current = true;
      return;
    }

    if (hasStartedAnimationRef.current) {
      return;
    }

    hasStartedAnimationRef.current = true;

    timeline.setValue(0);
    Animated.timing(timeline, {
      duration: 5200,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [animateSlogan, timeline]);

  const logoOpacity = timeline.interpolate({
    inputRange: [0, 0.28, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const logoMaskOpacity = timeline.interpolate({
    inputRange: [0, 0.28, 1],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });
  const logoTranslateY = timeline.interpolate({
    inputRange: [0, 0.28, 1],
    outputRange: [10, 0, 0],
    extrapolate: 'clamp',
  });
  const sloganOpacities = [
    timeline.interpolate({
      inputRange: [0.34, 0.5, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
    timeline.interpolate({
      inputRange: [0.5, 0.68, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
    timeline.interpolate({
      inputRange: [0.68, 0.86, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
  ] as const;

  return (
    <View style={styles.splashHero}>
      <View style={styles.splashLogoShell}>
        <Animated.Image
          fadeDuration={0}
          resizeMode="contain"
          source={require('../../assets/DiningDealz-Logo-Transparent.png')}
          style={[
            styles.splashLogoImage,
            {
              opacity: logoOpacity,
              transform: [{ translateY: logoTranslateY }],
            },
          ]}
        />
        <Animated.View pointerEvents="none" style={[styles.splashLogoRevealMask, { opacity: logoMaskOpacity }]} />
      </View>
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
    </View>
  );
}

export function SplashScreen({ onCreateAccount, onOpenMap, onSelectPortal }: SplashScreenProps) {
  return (
    <View style={styles.splashScreen}>
      <BrandHero animateSlogan />
      <View style={styles.splashActionGroup}>
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
        <Pressable onPress={onOpenMap} style={styles.splashOpenMapButton}>
          <Text style={styles.splashOpenMapButtonText}>Open Map as Guest</Text>
        </Pressable>
      </View>
    </View>
  );
}
