import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { fetchCustomerPreferences, saveCustomerPreferences } from '../api';
import { cityFilters, weekdayFilters, type CityFilterValue } from '../browseConfig';
import { NativeIOSLiquidGlassBackButton } from '../components/NativeIOSLiquidGlass';
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
type PreferenceBusinessDraft = CustomerPreferenceBusiness & {
  profile_updates_enabled: boolean;
  happy_hour_notifications_enabled: boolean;
  deal_updates_enabled: boolean;
  direct_message_notifications_enabled: boolean;
};

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
    profile_updates_enabled: Boolean(business.profile_updates_enabled),
    happy_hour_notifications_enabled: Boolean(business.happy_hour_notifications_enabled),
    deal_updates_enabled: Boolean(business.deal_updates_enabled),
    direct_message_notifications_enabled: Boolean(business.direct_message_notifications_enabled),
  };
}

function toggleAll<T>(current: T[], allValues: readonly T[], value: T) {
  if (current.includes(value)) {
    const next = current.filter((item) => item !== value);
    return next.length ? next : [value];
  }
  return [...current, value];
}

export function CustomerPreferencesScreen({ apiBaseUrl, authToken, isLandscape, mode, onBack, onComplete, onSkip, session }: CustomerPreferencesScreenProps) {
  const [step, setStep] = useState(mode === 'onboarding' ? 0 : 1);
  const [selectedCities, setSelectedCities] = useState<string[]>(mode === 'settings' && session.preferred_cities?.length ? session.preferred_cities : allCityValues);
  const [selectedDays, setSelectedDays] = useState<number[]>(mode === 'settings' && session.preferred_days?.length ? session.preferred_days : allDayValues);
  const [selectedTimePeriods, setSelectedTimePeriods] = useState<string[]>(mode === 'settings' && session.preferred_time_periods?.length ? session.preferred_time_periods : allTimeValues);
  const [notificationsPaused, setNotificationsPaused] = useState(Boolean(session.notifications_paused));
  const [businessOptions, setBusinessOptions] = useState<CustomerPreferenceBusiness[]>([]);
  const [selectedBusinesses, setSelectedBusinesses] = useState<PreferenceBusinessDraft[]>(() => (session.favorite_businesses ?? []).map(buildBusinessDraft));
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetchCustomerPreferences(apiBaseUrl, authToken, mode === 'settings');
        if (cancelled) {
          return;
        }
        setBusinessOptions(response.preference_businesses ?? []);
        if (mode === 'settings') {
          setSelectedBusinesses((response.favorite_businesses ?? []).map(buildBusinessDraft));
          setSelectedCities(response.preferred_cities?.length ? response.preferred_cities : allCityValues);
          setSelectedDays(response.preferred_days?.length ? response.preferred_days : allDayValues);
          setSelectedTimePeriods(response.preferred_time_periods?.length ? response.preferred_time_periods : allTimeValues);
          setNotificationsPaused(Boolean(response.notifications_paused));
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

  function toggleBusinessNotification(key: string, field: keyof Pick<PreferenceBusinessDraft, 'profile_updates_enabled' | 'happy_hour_notifications_enabled' | 'deal_updates_enabled' | 'direct_message_notifications_enabled'>) {
    setSelectedBusinesses((current) => current.map((business) => (
      getBusinessKey(business) === key ? { ...business, [field]: !business[field] } : business
    )));
  }

  function toggleAllBusinessNotifications(business: PreferenceBusinessDraft) {
    const enabled = !(
      business.profile_updates_enabled
      && business.happy_hour_notifications_enabled
      && business.deal_updates_enabled
      && business.direct_message_notifications_enabled
    );
    setSelectedBusinesses((current) => current.map((item) => (
      getBusinessKey(item) === getBusinessKey(business)
        ? {
            ...item,
            profile_updates_enabled: enabled,
            happy_hour_notifications_enabled: enabled,
            deal_updates_enabled: enabled,
            direct_message_notifications_enabled: enabled,
          }
        : item
    )));
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
      notifications_paused: notificationsPaused,
      businesses: selectedBusinesses.map((business) => ({
        slug: business.slug,
        location_id: business.location_id,
        profile_updates_enabled: business.profile_updates_enabled,
        happy_hour_notifications_enabled: business.happy_hour_notifications_enabled,
        deal_updates_enabled: business.deal_updates_enabled,
        direct_message_notifications_enabled: business.direct_message_notifications_enabled,
      })),
    } as const;
  }

  async function handleSkip() {
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
    if (mode === 'onboarding' && step === 0) {
      setStep(1);
      return;
    }
    if (step < 5) {
      setStep((current) => current + 1);
    }
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
        <Text style={styles.preferenceSupportText}>These are the exact locations currently shown by Confirmed Happy Hours & Deals.</Text>
        <TextInput onChangeText={setSearchQuery} placeholder="Search businesses" placeholderTextColor={theme.textDarkMuted} style={styles.preferenceSearchInput} value={searchQuery} />
        {loading ? <ActivityIndicator color={theme.accent} /> : null}
        {!loading && !visibleBusinessOptions.length ? <Text style={styles.preferenceEmptyText}>No confirmed deals matched these areas yet.</Text> : null}
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
                  <Text style={styles.preferenceSelectionMarkText}>{selected ? '✓' : '+'}</Text>
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
        <Text style={styles.preferenceSupportText}>Choose notifications separately for every location.</Text>
        <Pressable onPress={() => setNotificationsPaused((current) => !current)} style={styles.preferencePauseRow}>
          <View style={styles.preferenceBusinessCopy}>
            <Text style={styles.preferenceToggleLabel}>Pause all notifications</Text>
            <Text style={styles.preferenceSupportText}>You can pause alerts without changing your saved businesses.</Text>
          </View>
          <View style={[styles.preferenceToggle, notificationsPaused ? styles.preferenceToggleActive : null]}>
            <Text style={styles.preferenceToggleText}>{notificationsPaused ? 'On' : 'Off'}</Text>
          </View>
        </Pressable>
        {!selectedBusinesses.length ? <Text style={styles.preferenceEmptyText}>You can favorite businesses now and configure notifications later in Settings.</Text> : null}
        {selectedBusinesses.map((business) => {
          const key = getBusinessKey(business);
          return (
            <View key={key} style={styles.preferenceNotificationCard}>
              <Text style={styles.preferenceBusinessName}>{business.name}</Text>
              <Text style={styles.preferenceBusinessMeta}>{business.city_label} • {business.address_line_1}</Text>
              <Pressable onPress={() => toggleAllBusinessNotifications(business)} style={styles.preferenceSelectAllButton}>
                <Text style={styles.preferenceSelectAllText}>Select all / clear all</Text>
              </Pressable>
              {([
                ['profile_updates_enabled', 'Business profile updates'],
                ['happy_hour_notifications_enabled', 'Happy hour notifications'],
                ['deal_updates_enabled', 'Deal updates'],
                ['direct_message_notifications_enabled', 'Direct messages'],
              ] as const).map(([field, label]) => (
                <Pressable key={field} onPress={() => toggleBusinessNotification(key, field)} style={styles.preferenceToggleRow}>
                  <Text style={styles.preferenceToggleLabel}>{label}</Text>
                  <View style={[styles.preferenceToggle, business[field] ? styles.preferenceToggleActive : null]}>
                    <Text style={styles.preferenceToggleText}>{business[field] ? 'On' : 'Off'}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          );
        })}
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
        <View style={styles.preferenceReviewBlock}><Text style={styles.preferenceReviewLabel}>Notifications</Text><Text style={styles.preferenceReviewValue}>{notificationsPaused ? 'Paused' : 'Active'}</Text></View>
      </View>
    );
  }

  const title = mode === 'onboarding' && step === 0 ? 'Personalize your happy hour experience' : mode === 'settings' ? 'Happy hour preferences' : 'Make the map work for you';
  const body = mode === 'onboarding' && step === 0
    ? 'Choose locations, businesses, and notifications now. You can change everything later from Settings.'
    : null;
  const progressStep = mode === 'onboarding' ? step : step - 1;
  const progress = Math.min(Math.max((progressStep + 1) / 5, 0.2), 1);

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <ScrollView contentContainerStyle={styles.preferenceScrollContent} keyboardShouldPersistTaps="handled" onTouchStart={Keyboard.dismiss} showsVerticalScrollIndicator={false}>
        <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
          <NativeIOSLiquidGlassBackButton label={mode === 'settings' ? 'Back to Settings' : 'Skip for now'} onPress={mode === 'settings' ? onBack : handleSkip} />
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
          {loading && step !== 0 ? <View style={styles.preferenceLoading}><ActivityIndicator color={theme.accent} /><Text style={styles.preferenceSupportText}>Loading your preference options...</Text></View> : null}
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
          <View style={styles.preferenceActions}>
            {step > (mode === 'onboarding' ? 0 : 1) ? <Pressable disabled={submitting} onPress={() => setStep((current) => current - 1)} style={styles.preferenceSecondaryButton}><Text style={styles.preferenceSecondaryText}>Back</Text></Pressable> : null}
            {step < 5 ? <Pressable disabled={submitting} onPress={handleContinue} style={styles.preferencePrimaryButton}><Text style={styles.preferencePrimaryText}>{step === 0 ? 'Start' : 'Continue'}</Text></Pressable> : <Pressable disabled={submitting} onPress={() => void handleFinish()} style={styles.preferencePrimaryButton}>{submitting ? <ActivityIndicator color={theme.textOnAccent} /> : <Text style={styles.preferencePrimaryText}>{mode === 'onboarding' ? 'Finish setup' : 'Save preferences'}</Text>}</Pressable>}
          </View>
          {mode === 'onboarding' ? <Pressable disabled={submitting} onPress={() => void handleSkip()} style={styles.preferenceSkipButton}><Text style={styles.preferenceSkipText}>Skip for now</Text></Pressable> : null}
        </View>
      </ScrollView>
    </View>
  );
}
