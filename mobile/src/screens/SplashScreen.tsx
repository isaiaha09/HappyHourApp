import { useEffect, useRef } from 'react';
import { Animated, Easing, useWindowDimensions, View } from 'react-native';

import { styles } from '../appStyles';
import type { AuthPortal } from '../appFlowTypes';
import { GuestShellChrome } from '../components/GuestShellChrome';

const sloganWords = ['Discover.', 'Eat.', 'Save.'] as const;
const logoEntranceDuration = 900;
const sloganRevealDuration = 2200;
const completedSloganHoldDuration = 300;
const splashExitDuration = 680;
const sloganCompleteProgress = 0.68;
const mapHandoffDelay = logoEntranceDuration + sloganRevealDuration + completedSloganHoldDuration;
let splashIntroState: 'unplayed' | 'playing' | 'played' = 'unplayed';

export function resetSplashIntroState() {
  splashIntroState = 'unplayed';
}

type SplashScreenProps = {
  assetsReady?: boolean;
  chromeInteractive?: boolean;
  onCreateAccount: () => void;
  onIntroComplete: () => void;
  onSelectPortal: (portal: AuthPortal) => void;
  showHeader?: boolean;
  themeVariant?: 'default-dark' | 'map-dark' | 'map-light';
};

export function SplashScreen({ assetsReady = true, chromeInteractive = true, onCreateAccount, onIntroComplete, onSelectPortal, showHeader = true, themeVariant = 'default-dark' }: SplashScreenProps) {
  const { height } = useWindowDimensions();
  const timeline = useRef(new Animated.Value(splashIntroState === 'unplayed' ? 0 : 1)).current;
  const logoEntranceOpacity = useRef(new Animated.Value(splashIntroState === 'unplayed' ? 0 : 1)).current;
  const logoEntranceScale = useRef(new Animated.Value(splashIntroState === 'unplayed' ? 0.5 : 1)).current;
  const hasStartedAnimationRef = useRef(false);
  const hasCompletedIntroRef = useRef(false);
  const onIntroCompleteRef = useRef(onIntroComplete);

  useEffect(() => {
    onIntroCompleteRef.current = onIntroComplete;
  }, [onIntroComplete]);

  useEffect(() => {
    if (!assetsReady) {
      return;
    }

    let handoffTimer: ReturnType<typeof setTimeout> | null = null;
    let introFailSafeTimer: ReturnType<typeof setTimeout> | null = null;

    const beginMapHandoff = () => {
      if (hasCompletedIntroRef.current) {
        return;
      }

      hasCompletedIntroRef.current = true;
      splashIntroState = 'played';
      if (introFailSafeTimer) {
        clearTimeout(introFailSafeTimer);
      }
      onIntroCompleteRef.current();
    };

    if (splashIntroState !== 'unplayed') {
      hasStartedAnimationRef.current = true;
      timeline.setValue(1);
      logoEntranceOpacity.setValue(1);
      logoEntranceScale.setValue(1);
      return () => {
        if (handoffTimer) {
          clearTimeout(handoffTimer);
        }
      };
    }

    if (hasStartedAnimationRef.current) {
      return;
    }

    hasStartedAnimationRef.current = true;
    splashIntroState = 'playing';
    timeline.setValue(0);
    logoEntranceOpacity.setValue(0);
    logoEntranceScale.setValue(0.5);
    introFailSafeTimer = setTimeout(() => {
      timeline.stopAnimation();
      logoEntranceOpacity.stopAnimation();
      logoEntranceScale.stopAnimation();
      timeline.setValue(1);
      logoEntranceOpacity.setValue(1);
      logoEntranceScale.setValue(1);
      beginMapHandoff();
    }, mapHandoffDelay + splashExitDuration + 1000);
    handoffTimer = setTimeout(beginMapHandoff, mapHandoffDelay);
    Animated.parallel([
      Animated.timing(logoEntranceOpacity, {
        duration: logoEntranceDuration,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(logoEntranceScale, {
        duration: logoEntranceDuration,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(timeline, {
          duration: logoEntranceDuration,
          easing: Easing.out(Easing.cubic),
          toValue: 0.16,
          useNativeDriver: true,
        }),
        Animated.timing(timeline, {
          duration: sloganRevealDuration,
          easing: Easing.linear,
          toValue: sloganCompleteProgress,
          useNativeDriver: true,
        }),
        Animated.delay(completedSloganHoldDuration),
        Animated.timing(timeline, {
          duration: splashExitDuration,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) {
        timeline.setValue(1);
        logoEntranceOpacity.setValue(1);
        logoEntranceScale.setValue(1);
      }
    });

    return () => {
      if (introFailSafeTimer) {
        clearTimeout(introFailSafeTimer);
      }
      if (handoffTimer) {
        clearTimeout(handoffTimer);
      }
    };
  }, [assetsReady, logoEntranceOpacity, logoEntranceScale, timeline]);

  const logoTravelStart = Math.max(height * 0.24, 150);
  const splashExitOpacity = timeline.interpolate({
    inputRange: [sloganCompleteProgress, 1],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const headerOpacity = timeline.interpolate({
    inputRange: [0.84, 0.98, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const logoTranslateY = timeline.interpolate({
    inputRange: [0, 0.16, sloganCompleteProgress, 1],
    outputRange: [logoTravelStart, logoTravelStart, logoTravelStart, 0],
    extrapolate: 'clamp',
  });
  const logoScale = timeline.interpolate({
    inputRange: [0, 0.16, sloganCompleteProgress, 1],
    outputRange: [1.22, 1.22, 1.22, 0.5],
    extrapolate: 'clamp',
  });
  const sloganRevealOpacity = timeline.interpolate({
    inputRange: [0.16, 0.24, sloganCompleteProgress],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const sloganBlockOpacity = Animated.multiply(sloganRevealOpacity, splashExitOpacity);
  const sloganBlockTranslateY = timeline.interpolate({
    inputRange: [0.16, 0.24, sloganCompleteProgress, 1],
    outputRange: [0, 0, 0, -8],
    extrapolate: 'clamp',
  });
  const sloganWordAnimations = [
    { start: 0.18, end: 0.3 },
    { start: 0.32, end: 0.44 },
    { start: 0.46, end: 0.58 },
  ].map(({ end, start }) => ({
    opacity: timeline.interpolate({
      inputRange: [start, end, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
    translateY: timeline.interpolate({
      inputRange: [start, end, 1],
      outputRange: [10, 0, 0],
      extrapolate: 'clamp',
    }),
  }));
  const actionOpacity = timeline.interpolate({
    inputRange: [0.72, 0.96, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const actionTranslateY = timeline.interpolate({
    inputRange: [0.72, 0.96, 1],
    outputRange: [18, 0, 0],
    extrapolate: 'clamp',
  });
  return (
    <View style={styles.splashScreen}>
      <Animated.View
        pointerEvents="none"
        style={[styles.splashBackdrop, { opacity: splashExitOpacity }]}
      />
      <View style={[styles.splashIntroContent, { paddingTop: logoTravelStart + 200 }]}>
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
                style={[
                  styles.splashSloganWord,
                  {
                    opacity: sloganWordAnimations[index].opacity,
                    transform: [{ translateY: sloganWordAnimations[index].translateY }],
                  },
                ]}
              >
                {word}
              </Animated.Text>
            ))}
          </View>
        </Animated.View>
      </View>

      <GuestShellChrome
        actionOpacity={actionOpacity}
        actionTranslateY={actionTranslateY}
        headerOpacity={headerOpacity}
        interactive={chromeInteractive}
        logoEntranceOpacity={logoEntranceOpacity}
        logoEntranceScale={logoEntranceScale}
        logoScale={logoScale}
        logoTranslateY={logoTranslateY}
        onCreateAccount={onCreateAccount}
        onSelectPortal={onSelectPortal}
        showHeader={showHeader}
        themeVariant={themeVariant}
      />
    </View>
  );
}
