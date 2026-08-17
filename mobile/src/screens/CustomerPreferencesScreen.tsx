import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchCustomerPreferences, saveCustomerPreferences } from '../api';
import { cityFilters, weekdayFilters, type CityFilterValue } from '../browseConfig';
import { NativeIOSLiquidGlassBackButton, NativeIOSLiquidGlassHeaderButton } from '../components/NativeIOSLiquidGlass';
import { styles } from '../appStyles';
import { theme } from '../styles/theme';
import type { CustomerPreferenceBusiness, SignupResponse } from '../types';

const timePeriodOptions = [
  { label: 'Morning', value: 'morning' },
  { label: 'Afternoon', value: 'afternoon' },
  { label: 'Evening', value: 'evening' },
] as const;

const allCityValues = cityFilters.filter((filter) => filter.value !== 'all').map((filter) => filter.value);
const allDayValues = weekdayFilters.map((filter) => filter.value);
const allTimeValues = timePeriodOptions.map((option) => option.value);

type PreferenceMode = 'onboarding' | 'settings';
type PreferenceBusinessInput = Omit<CustomerPreferenceBusiness, 'location_id'> & { location_id?: number | null };
type PreferenceBusinessDraft = CustomerPreferenceBusiness;

export type CustomerPreferencesScreenProps = {
  apiBaseUrl: string;
  authToken: string;
  isLandscape: boolean;
  mode: PreferenceMode;
  onBack: () => void;
  onComplete: (session: SignupResponse) => void;
  onSkip: (session: SignupResponse) => void;
  session: SignupResponse;
};

function getBusinessKey(business: Pick<CustomerPreferenceBusiness, 'slug' | 'location_id'>) {
  return `${business.slug}:${business.location_id ?? 'primary'}`;
}

function buildBusinessDraft(business: PreferenceBusinessInput): PreferenceBusinessDraft {
  return {
    ...business,
    location_id: business.location_id ?? null,
  };
}

function filterToAvailablePreferenceBusinesses(businesses: PreferenceBusinessInput[], options: CustomerPreferenceBusiness[]) {
  const availableKeys = new Set(options.filter((business) => business.has_happy_hours === true).map(getBusinessKey));
  const seenKeys = new Set<string>();
  return businesses
    .map(buildBusinessDraft)
    .filter((business) => {
      const key = getBusinessKey(business);
      if (!availableKeys.has(key) || seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    });
}

function toggleAll<T>(current: T[], allValues: readonly T[], value: T) {
  if (current.includes(value)) {
    const next = current.filter((item) => item !== value);
    return next.length ? next : [value];
  }
  return [...current, value];
}

export function CustomerPreferencesScreen({ apiBaseUrl, authToken, isLandscape, mode, onBack, onComplete, onSkip, session }: CustomerPreferencesScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(mode === 'onboarding' ? 0 : 1);
  const [selectedCities, setSelectedCities] = useState<string[]>(mode === 'settings' && session.preferred_cities?.length ? session.preferred_cities : allCityValues);
  const [selectedDays, setSelectedDays] = useState<number[]>(mode === 'settings' && session.preferred_days?.length ? session.preferred_days : allDayValues);
  const [selectedTimePeriods, setSelectedTimePeriods] = useState<string[]>(mode === 'settings' && session.preferred_time_periods?.length ? session.preferred_time_periods : allTimeValues);
  const [businessOptions, setBusinessOptions] = useState<CustomerPreferenceBusiness[]>([]);
  const [selectedBusinesses, setSelectedBusinesses] = useState<PreferenceBusinessDraft[]>(() => mode === 'settings' ? [] : (session.favorite_businesses ?? []).map(buildBusinessDraft));
  const [directMessagesEnabled, setDirectMessagesEnabled] = useState(Boolean(session.direct_message_notifications_enabled));
  const [businessUpdatesEnabled, setBusinessUpdatesEnabled] = useState(Boolean(session.business_updates_notifications_enabled));
  const [happyHourNotificationsEnabled, setHappyHourNotificationsEnabled] = useState(Boolean(session.happy_hour_notifications_enabled));
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const stepContentOpacity = useRef(new Animated.Value(1)).current;
  const stepContentTranslateX = useRef(new Animated.Value(0)).current;
  const stepTransitionActiveRef = useRef(false);
  const stepTransitionFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (stepTransitionFrameRef.current !== null) {
      cancelAnimationFrame(stepTransitionFrameRef.current);
      stepTransitionFrameRef.current = null;
    }
    stepContentOpacity.stopAnimation();
    stepContentTranslateX.stopAnimation();
  }, [stepContentOpacity, stepContentTranslateX]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetchCustomerPreferences(apiBaseUrl, authToken, false);
        if (cancelled) {
          return;
        }
        const availablePreferenceBusinesses = (response.preference_businesses ?? []).filter((business) => business.has_happy_hours === true);
        setBusinessOptions(availablePreferenceBusinesses);
        setSelectedBusinesses(filterToAvailablePreferenceBusinesses(response.favorite_businesses ?? [], availablePreferenceBusinesses));
        if (mode === 'settings') {
          setSelectedCities(response.preferred_cities?.length ? response.preferred_cities : allCityValues);
          setSelectedDays(response.preferred_days?.length ? response.preferred_days : allDayValues);
          setSelectedTimePeriods(response.preferred_time_periods?.length ? response.preferred_time_periods : allTimeValues);
          setDirectMessagesEnabled(Boolean(response.direct_message_notifications_enabled));
          setBusinessUpdatesEnabled(Boolean(response.business_updates_notifications_enabled));
          setHappyHourNotificationsEnabled(Boolean(response.happy_hour_notifications_enabled));
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Preferences could not be loaded.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, authToken, mode]);

  const visibleBusinessOptions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return businessOptions.filter((business) => {
      if (!selectedCities.includes(business.city)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [business.name, business.city_label, business.address_line_1].join(' ').toLowerCase().includes(normalizedQuery);
    });
  }, [businessOptions, searchQuery, selectedCities]);
  const continueDisabled = submitting || (loading && (mode === 'onboarding' ? step !== 0 : step >= 2));

  const allNotificationsEnabled = directMessagesEnabled && businessUpdatesEnabled && happyHourNotificationsEnabled;

  function toggleCity(city: CityFilterValue | 'all') {
    if (city === 'all') {
      setSelectedCities(allCityValues);
      return;
    }
    setSelectedCities((current) => {
      const next = current.includes(city) ? current.filter((value) => value !== city) : [...current, city];
      return next.length ? next : [city];
    });
  }

  function toggleBusiness(option: CustomerPreferenceBusiness) {
    const key = getBusinessKey(option);
    setSelectedBusinesses((current) => {
      if (current.some((business) => getBusinessKey(business) === key)) {
        return current.filter((business) => getBusinessKey(business) !== key);
      }
      return [...current, buildBusinessDraft(option)];
    });
  }

  function toggleAllNotifications() {
    const enabled = !allNotificationsEnabled;
    setDirectMessagesEnabled(enabled);
    setBusinessUpdatesEnabled(enabled);
    setHappyHourNotificationsEnabled(enabled);
  }

  function toggleDay(day: number) {
    setSelectedDays((current) => toggleAll(current, allDayValues, day));
  }

  function toggleTimePeriod(period: string) {
    setSelectedTimePeriods((current) => toggleAll(current, allTimeValues, period));
  }

  function buildPayload(action: 'complete' | 'skip' | 'save') {
    return {
      action,
      preferred_cities: selectedCities,
      preferred_days: selectedDays,
      preferred_time_periods: selectedTimePeriods,
      notifications_paused: false,
      direct_message_notifications_enabled: directMessagesEnabled,
      business_updates_notifications_enabled: businessUpdatesEnabled,
      happy_hour_notifications_enabled: happyHourNotificationsEnabled,
      businesses: selectedBusinesses.map((business) => ({
        slug: business.slug,
        location_id: business.location_id,
        profile_updates_enabled: businessUpdatesEnabled,
        happy_hour_notifications_enabled: happyHourNotificationsEnabled,
        deal_updates_enabled: businessUpdatesEnabled,
        direct_message_notifications_enabled: directMessagesEnabled,
      })),
    } as const;
  }

  async function handleSkip() {
    if (mode === 'onboarding' && step < 5) {
      goToStep(Math.min(step + 1, 5));
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await saveCustomerPreferences(apiBaseUrl, authToken, { action: 'skip' });
      onSkip(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Preferences could not be skipped.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinish() {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await saveCustomerPreferences(apiBaseUrl, authToken, buildPayload(mode === 'onboarding' ? 'complete' : 'save'));
      onComplete(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Preferences could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleContinue() {
    if (continueDisabled) {
      return;
    }
    if (mode === 'onboarding' && step === 1 && loading) {
      return;
    }
    goToStep(step === 0 && mode === 'onboarding' ? 1 : Math.min(step + 1, 5));
  }

  function handleBackPress() {
    if ((mode === 'onboarding' && step > 0) || (mode === 'settings' && step > 1)) {
      goToStep(step - 1);
      return;
    }
    onBack();
  }

  function goToStep(nextStep: number) {
    if (nextStep === step || stepTransitionActiveRef.current) {
      return;
    }

    const direction = nextStep > step ? 1 : -1;
    stepTransitionActiveRef.current = true;
    stepContentOpacity.stopAnimation();
    stepContentTranslateX.stopAnimation();

    Animated.parallel([
      Animated.timing(stepContentOpacity, {
        duration: 120,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(stepContentTranslateX, {
        duration: 120,
        easing: Easing.out(Easing.cubic),
        toValue: direction * -24,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        stepTransitionActiveRef.current = false;
        return;
      }

      setStep(nextStep);
      stepTransitionFrameRef.current = requestAnimationFrame(() => {
        stepTransitionFrameRef.current = null;
        stepContentTranslateX.setValue(direction * 24);
        Animated.parallel([
          Animated.timing(stepContentOpacity, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(stepContentTranslateX, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
            toValue: 0,
            useNativeDriver: true,
          }),
        ]).start(() => {
          stepTransitionActiveRef.current = false;
        });
      });
    });
  }

  function renderChip(label: string, active: boolean, onPress: () => void, key: string) {
    return (
      <Pressable key={key} onPress={onPress} style={[styles.preferenceChip, active ? styles.preferenceChipActive : null]}>
        <Text style={[styles.preferenceChipText, active ? styles.preferenceChipTextActive : null]}>{label}</Text>
      </Pressable>
    );
  }

  function renderLocations() {
    return (
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>Where do you go out?</Text>
        <Text style={styles.preferenceSupportText}>Choose the areas you want to use while picking your favorite businesses.</Text>
        <View style={styles.preferenceChipWrap}>
          {renderChip('All 3', selectedCities.length === allCityValues.length, () => toggleCity('all'), 'all')}
          {cityFilters.filter((filter) => filter.value !== 'all').map((filter) => renderChip(filter.label, selectedCities.includes(filter.value), () => toggleCity(filter.value), filter.value))}
        </View>
      </View>
    );
  }

  function renderBusinesses() {
    return (
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>Choose businesses</Text>
        <Text style={styles.preferenceSupportText}>These are the exact locations with current confirmed happy hours.</Text>
        <TextInput onChangeText={setSearchQuery} placeholder="Search businesses" placeholderTextColor={theme.textDarkMuted} style={styles.preferenceSearchInput} value={searchQuery} />
        {loading ? <ActivityIndicator color={theme.accent} /> : null}
        {!loading && !visibleBusinessOptions.length ? <Text style={styles.preferenceEmptyText}>No confirmed happy-hour locations matched these areas yet.</Text> : null}
        <View style={styles.preferenceBusinessList}>
          {visibleBusinessOptions.map((business) => {
            const selected = selectedBusinesses.some((item) => getBusinessKey(item) === getBusinessKey(business));
            return (
              <Pressable key={getBusinessKey(business)} onPress={() => toggleBusiness(business)} style={[styles.preferenceBusinessCard, selected ? styles.preferenceBusinessCardActive : null]}>
                <View style={styles.preferenceBusinessCopy}>
                  <Text style={styles.preferenceBusinessName}>{business.name}</Text>
                  <Text style={styles.preferenceBusinessMeta}>{business.city_label} • {business.address_line_1}</Text>
                  <Text style={styles.preferenceBusinessDeal}>{`${business.deal_count ?? 1} confirmed deal${business.deal_count === 1 ? '' : 's'}`}</Text>
                </View>
                <View style={[styles.preferenceSelectionMark, selected ? styles.preferenceSelectionMarkActive : null]}>
                  <Text style={styles.preferenceSelectionMarkText}>{selected ? '♥' : '+'}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.preferenceSelectionCount}>{selectedBusinesses.length} business{selectedBusinesses.length === 1 ? '' : 'es'} selected</Text>
      </View>
    );
  }

  function renderNotifications() {
    return (
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>What should each business send you?</Text>
        <Text style={styles.preferenceSupportText}>These settings apply to all businesses you favorite and all businesses you directly message.</Text>
        <View style={styles.preferenceNotificationCard}>
          <Text style={styles.preferenceSupportText}>Tap the buttons below to choose the notification types you want to turn on overall.</Text>
          <View style={styles.preferenceChipWrap}>
            {renderChip('Turn on all notifications', allNotificationsEnabled, toggleAllNotifications, 'notifications:all')}
            {renderChip('Direct Messages', directMessagesEnabled, () => setDirectMessagesEnabled((current) => !current), 'notifications:dm')}
            {renderChip('Business Profile/Deal Updates', businessUpdatesEnabled, () => setBusinessUpdatesEnabled((current) => !current), 'notifications:updates')}
            {renderChip('Happy Hour Notifications', happyHourNotificationsEnabled, () => setHappyHourNotificationsEnabled((current) => !current), 'notifications:happy-hour')}
          </View>
        </View>
      </View>
    );
  }

  function renderDaysAndTimes() {
    return (
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>When do you usually go out?</Text>
        <Text style={styles.preferenceSupportText}>These simple windows control happy-hour alerts. Direct messages remain immediate.</Text>
        <Text style={styles.preferenceLabel}>Days</Text>
        <View style={styles.preferenceChipWrap}>
          {renderChip('All days', selectedDays.length === allDayValues.length, () => setSelectedDays(allDayValues), 'all-days')}
          {weekdayFilters.map((filter) => renderChip(filter.label, selectedDays.includes(filter.value), () => toggleDay(filter.value), `day-${filter.value}`))}
        </View>
        <Text style={styles.preferenceLabel}>Time of day</Text>
        <View style={styles.preferenceChipWrap}>
          {renderChip('All times', selectedTimePeriods.length === allTimeValues.length, () => setSelectedTimePeriods(allTimeValues), 'all-times')}
          {timePeriodOptions.map((option) => renderChip(option.label, selectedTimePeriods.includes(option.value), () => toggleTimePeriod(option.value), option.value))}
        </View>
      </View>
    );
  }

  function renderReview() {
    const cityLabels = selectedCities.map((city) => cityFilters.find((filter) => filter.value === city)?.label ?? city).join(', ');
    const dayLabels = weekdayFilters.filter((filter) => selectedDays.includes(filter.value)).map((filter) => filter.label).join(', ');
    const timeLabels = timePeriodOptions.filter((option) => selectedTimePeriods.includes(option.value)).map((option) => option.label).join(', ');
    return (
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>Review your preferences</Text>
        <View style={styles.preferenceReviewBlock}><Text style={styles.preferenceReviewLabel}>Areas</Text><Text style={styles.preferenceReviewValue}>{cityLabels || 'None selected'}</Text></View>
        <View style={styles.preferenceReviewBlock}><Text style={styles.preferenceReviewLabel}>Favorite businesses</Text>{selectedBusinesses.length ? selectedBusinesses.map((business) => <Text key={getBusinessKey(business)} style={styles.preferenceReviewValue}>{`${business.name} - ${business.city_label}`}</Text>) : <Text style={styles.preferenceReviewValue}>None selected</Text>}</View>
        <View style={styles.preferenceReviewBlock}><Text style={styles.preferenceReviewLabel}>Days</Text><Text style={styles.preferenceReviewValue}>{dayLabels || 'None selected'}</Text></View>
        <View style={styles.preferenceReviewBlock}><Text style={styles.preferenceReviewLabel}>Times</Text><Text style={styles.preferenceReviewValue}>{timeLabels || 'None selected'}</Text></View>
        <View style={styles.preferenceReviewBlock}><Text style={styles.preferenceReviewLabel}>Notifications</Text><Text style={styles.preferenceReviewValue}>{[
          directMessagesEnabled ? 'Direct Messages' : null,
          businessUpdatesEnabled ? 'Business Profile/Deal Updates' : null,
          happyHourNotificationsEnabled ? 'Happy Hour Notifications' : null,
        ].filter(Boolean).join(', ') || 'None selected'}</Text></View>
      </View>
    );
  }

  const title = mode === 'onboarding' && step === 0 ? 'Personalize your happy hour experience' : mode === 'settings' ? 'Happy hour preferences' : 'Make the map work for you';
  const body = mode === 'onboarding' && step === 0
    ? 'Choose locations, businesses, and notifications now. You can change everything later from Settings.'
    : null;
  const progressStep = mode === 'onboarding' ? step : step - 1;
  const progress = Math.min(Math.max((progressStep + 1) / 5, 0.2), 1);

  const showStepLoading = mode === 'onboarding' && loading && step === 2;
  const showHeaderAdvanceAction = step < 5;
  const headerAdvanceLabel = mode === 'onboarding' ? 'Skip for now' : 'Next';
  const headerAdvanceStyle = mode === 'onboarding' ? styles.preferenceHeaderSkipButton : styles.preferenceHeaderNextButton;
  const nativeHeaderActionOffset = mode === 'onboarding' ? -15 : -40;
  const preferenceScrollContentStyle = [
    styles.preferenceScrollContent,
    { paddingBottom: Math.max(176, insets.bottom + 144) },
  ];

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <ScrollView contentContainerStyle={preferenceScrollContentStyle} keyboardShouldPersistTaps="handled" onTouchStart={Keyboard.dismiss} showsVerticalScrollIndicator={false}>
        <View style={[styles.screenHeaderBar, styles.screenHeaderBarRow, styles.preferenceHeaderRowOffset]}>
          <NativeIOSLiquidGlassBackButton label={mode === 'settings' ? 'Back to Settings' : 'Back'} onPress={handleBackPress} style={styles.preferenceHeaderBackButton} />
          {showHeaderAdvanceAction ? (
            <NativeIOSLiquidGlassHeaderButton
              fallback={(
                <Pressable onPress={mode === 'onboarding' ? handleSkip : handleContinue} style={[styles.preferenceHeaderActionButton, headerAdvanceStyle]}>
                  <Text style={styles.preferenceHeaderActionText}>{headerAdvanceLabel}</Text>
                </Pressable>
              )}
              label={headerAdvanceLabel}
              nativeHorizontalOffset={nativeHeaderActionOffset}
              onPress={mode === 'onboarding' ? handleSkip : handleContinue}
              style={[styles.preferenceHeaderActionButton, headerAdvanceStyle]}
              themeVariant="default-dark"
              variant="pill"
            />
          ) : <View style={styles.preferenceHeaderSpacer} />}
        </View>
        <View style={styles.preferenceShell}>
          <View style={styles.preferenceProgressHeader}>
            <Text style={styles.preferenceEyebrow}>{mode === 'onboarding' ? `Step ${Math.min(step + 1, 5)} of 5` : 'Settings'}</Text>
            {mode === 'onboarding' ? <Text style={styles.preferenceProgressText}>{Math.round(progress * 100)}%</Text> : null}
          </View>
          {mode === 'onboarding' ? <View style={styles.preferenceProgressTrack}><View style={[styles.preferenceProgressFill, { width: `${progress * 100}%` }]} /></View> : null}
          <Text style={styles.preferenceTitle}>{title}</Text>
          {body ? <Text style={styles.preferenceIntro}>{body}</Text> : null}
          {errorMessage ? <View style={styles.errorBanner}><Text style={styles.errorText}>{errorMessage}</Text></View> : null}
          {showStepLoading ? <View style={styles.preferenceLoading}><ActivityIndicator color={theme.accent} /><Text style={styles.preferenceSupportText}>Loading your preference options...</Text></View> : null}
          <Animated.View style={{ opacity: stepContentOpacity, transform: [{ translateX: stepContentTranslateX }] }}>
            {step === 0 && mode === 'onboarding' ? (
              <View style={styles.preferenceWelcomeBlock}>
                <Text style={styles.preferenceWelcomeTitle}>A few quick choices, then you are ready to explore.</Text>
                <Text style={styles.preferenceSupportText}>We will show businesses with confirmed happy hours or deals, let you choose alert types for each location, and keep your schedule simple.</Text>
              </View>
            ) : null}
            {step === 1 ? renderLocations() : null}
            {step === 2 ? renderBusinesses() : null}
            {step === 3 ? renderNotifications() : null}
            {step === 4 ? renderDaysAndTimes() : null}
            {step === 5 ? renderReview() : null}
          </Animated.View>
          <View style={styles.preferenceActions}>
            {step < 5 ? <Pressable disabled={continueDisabled} onPress={handleContinue} style={[styles.preferencePrimaryButton, continueDisabled ? styles.linkButtonDisabled : null]}><Text style={styles.preferencePrimaryText}>{step === 0 ? 'Start' : 'Continue'}</Text></Pressable> : <Pressable disabled={submitting} onPress={() => void handleFinish()} style={styles.preferencePrimaryButton}>{submitting ? <ActivityIndicator color={theme.textOnAccent} /> : <Text style={styles.preferencePrimaryText}>{mode === 'onboarding' ? 'Finish setup' : 'Save preferences'}</Text>}</Pressable>}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
