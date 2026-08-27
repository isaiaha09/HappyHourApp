import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import {
  buildCalendarDraftFromParts,
  buildCalendarNotes,
  buildShareText,
  formatDateLabel,
  formatPlannerDateInput,
  formatPlannerTimeInput,
  formatTimeLabel,
  getDefaultCalendarSelection,
  getDefaultShareSelection,
  getPlannerSchedules,
  parsePlannerDateInput,
  parsePlannerTimeInput,
  type CalendarEventDraft,
  type PlannerPlaceContext,
  type PlannerSchedule,
  type RestaurantShareSelection,
  validateCalendarDraft,
} from '../externalPlanner';

type ExternalPlannerModalProps = {
  context: PlannerPlaceContext | null;
  errorMessage?: string | null;
  mode: 'calendar' | 'share';
  onCalendarSubmit: (draft: CalendarEventDraft) => Promise<void> | void;
  onClose: () => void;
  onShareSubmit: (selection: RestaurantShareSelection, cardRef: RefObject<ViewShotRef | null>) => Promise<void> | void;
  visible: boolean;
};

const palette = {
  accent: '#ff5b61',
  background: '#11161b',
  border: '#39434c',
  card: '#20272e',
  muted: '#a8b0b6',
  text: '#f7f8f5',
};

export function ExternalPlannerModal({
  context,
  errorMessage,
  mode,
  onCalendarSubmit,
  onClose,
  onShareSubmit,
  visible,
}: ExternalPlannerModalProps) {
  if (!context) {
    return null;
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <View style={styles.backdrop} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleCopy}>
              <Text style={styles.modalEyebrow}>DiningDealz</Text>
              <Text style={styles.modalTitle}>{mode === 'calendar' ? 'Add to Calendar' : 'Share Restaurant'}</Text>
              <Text numberOfLines={1} style={styles.modalSubtitle}>{context.name}</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}>
              <Ionicons color={palette.text} name="close" size={21} />
            </Pressable>
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {mode === 'calendar' ? (
            <CalendarComposer context={context} onClose={onClose} onSubmit={onCalendarSubmit} />
          ) : (
            <ShareComposer context={context} onClose={onClose} onSubmit={onShareSubmit} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type CalendarComposerProps = {
  context: PlannerPlaceContext;
  onClose: () => void;
  onSubmit: (draft: CalendarEventDraft) => Promise<void> | void;
};

function CalendarComposer({ context, onClose, onSubmit }: CalendarComposerProps) {
  const schedules = useMemo(() => getPlannerSchedules(context), [context]);
  const initialSelection = useMemo(() => getDefaultCalendarSelection(context), [context]);
  const [date, setDate] = useState(initialSelection.date);
  const [startTime, setStartTime] = useState(initialSelection.startTime);
  const [endTime, setEndTime] = useState(initialSelection.endTime);
  const [allDay, setAllDay] = useState(initialSelection.allDay);
  const [weeklyRepeat, setWeeklyRepeat] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState(initialSelection.scheduleId ?? 'custom');
  const [submitting, setSubmitting] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    setDate(initialSelection.date);
    setStartTime(initialSelection.startTime);
    setEndTime(initialSelection.endTime);
    setAllDay(initialSelection.allDay);
    setSelectedScheduleId(initialSelection.scheduleId ?? 'custom');
    setWeeklyRepeat(false);
    setValidationMessage(null);
  }, [initialSelection]);

  function selectSchedule(schedule: PlannerSchedule) {
    const selection = getDefaultCalendarSelection(context, schedule);
    setDate(selection.date);
    setStartTime(selection.startTime);
    setEndTime(selection.endTime);
    setAllDay(selection.allDay);
    setSelectedScheduleId(schedule.id);
    setValidationMessage(null);
  }

  async function submit() {
    Keyboard.dismiss();
    const nextValidationMessage = validateCalendarDraft({ allDay, date, endTime, startTime });
    if (nextValidationMessage) {
      setValidationMessage(nextValidationMessage);
      return;
    }

    const selectedSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId);
    const draft = buildCalendarDraftFromParts({
      allDay,
      date,
      endTime,
      location: context.address,
      name: context.name,
      notes: buildCalendarNotes(context, selectedSchedule),
      startTime,
      timeZone: context.timeZone,
      weeklyRepeat,
    });

    setSubmitting(true);
    setValidationMessage(null);
    try {
      await onSubmit(draft);
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : 'Unable to open the calendar editor.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.composerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionLabel}>Choose a time</Text>
      <View style={styles.presetList}>
        {schedules.map((schedule) => (
          <Pressable
            accessibilityRole="button"
            key={schedule.id}
            onPress={() => selectSchedule(schedule)}
            style={[styles.presetButton, selectedScheduleId === schedule.id ? styles.presetButtonActive : null]}
          >
            <Text style={[styles.presetTitle, selectedScheduleId === schedule.id ? styles.presetTitleActive : null]}>{schedule.label}</Text>
            <Text style={styles.presetMeta}>
              {[schedule.weekdayLabel, schedule.allDay ? 'All day' : `${formatTimeLabel(schedule.startTime)} - ${formatTimeLabel(schedule.endTime)}`].filter(Boolean).join(' · ')}
            </Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setSelectedScheduleId('custom')} style={[styles.presetButton, selectedScheduleId === 'custom' ? styles.presetButtonActive : null]}>
          <Text style={[styles.presetTitle, selectedScheduleId === 'custom' ? styles.presetTitleActive : null]}>Custom time</Text>
          <Text style={styles.presetMeta}>Enter your own availability</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Date</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={palette.muted}
        style={styles.input}
        value={date}
      />
      <Text style={styles.helperText}>{date ? formatDateLabel(date) : 'Use the date you plan to visit.'}</Text>

      <View style={styles.timeRow}>
        <View style={styles.timeField}>
          <Text style={styles.fieldLabel}>Start</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            onChangeText={setStartTime}
            placeholder="15:00"
            placeholderTextColor={palette.muted}
            style={styles.input}
            value={startTime}
          />
        </View>
        <View style={styles.timeField}>
          <Text style={styles.fieldLabel}>End</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            onChangeText={setEndTime}
            placeholder="18:00"
            placeholderTextColor={palette.muted}
            style={styles.input}
            value={endTime}
          />
        </View>
      </View>

      <View style={styles.optionRow}>
        <View style={styles.optionCopy}>
          <Text style={styles.optionTitle}>All-day event</Text>
          <Text style={styles.optionSubtitle}>Use this for an all-day schedule.</Text>
        </View>
        <Switch onValueChange={setAllDay} thumbColor={allDay ? palette.accent : '#d5d9d6'} trackColor={{ false: '#3c454c', true: '#7a3138' }} value={allDay} />
      </View>
      <View style={styles.optionRow}>
        <View style={styles.optionCopy}>
          <Text style={styles.optionTitle}>Repeat weekly</Text>
          <Text style={styles.optionSubtitle}>Off by default. You can edit it in your calendar.</Text>
        </View>
        <Switch onValueChange={setWeeklyRepeat} thumbColor={weeklyRepeat ? palette.accent : '#d5d9d6'} trackColor={{ false: '#3c454c', true: '#7a3138' }} value={weeklyRepeat} />
      </View>

      {validationMessage ? <Text style={styles.errorText}>{validationMessage}</Text> : null}
      <Text style={styles.disclaimer}>DiningDealz opens your device calendar editor. We do not read your existing calendars.</Text>
      <View style={styles.footerActions}>
        <Pressable disabled={submitting} onPress={onClose} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable disabled={submitting} onPress={() => void submit()} style={styles.primaryButton}>
          {submitting ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>Open Calendar</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

type ShareComposerProps = {
  context: PlannerPlaceContext;
  onClose: () => void;
  onSubmit: (selection: RestaurantShareSelection, cardRef: RefObject<ViewShotRef | null>) => Promise<void> | void;
};

function ShareComposer({ context, onClose, onSubmit }: ShareComposerProps) {
  const shareCardRef = useRef<ViewShotRef | null>(null);
  const schedules = useMemo(() => getPlannerSchedules(context), [context]);
  const firstSchedule = schedules[0];
  const defaultMyTime = useMemo(() => getDefaultCalendarSelection(context, firstSchedule), [context, firstSchedule]);
  const [selection, setSelection] = useState<RestaurantShareSelection>(() => ({
    ...getDefaultShareSelection(context),
    date: defaultMyTime.date,
    endTime: defaultMyTime.endTime,
    startTime: defaultMyTime.startTime,
  }));
  const [dateInput, setDateInput] = useState(() => formatPlannerDateInput(defaultMyTime.date));
  const [startTimeInput, setStartTimeInput] = useState(() => formatPlannerTimeInput(defaultMyTime.startTime));
  const [endTimeInput, setEndTimeInput] = useState(() => formatPlannerTimeInput(defaultMyTime.endTime));
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSelection({
      ...getDefaultShareSelection(context),
      date: defaultMyTime.date,
      endTime: defaultMyTime.endTime,
      startTime: defaultMyTime.startTime,
    });
    setDateInput(formatPlannerDateInput(defaultMyTime.date));
    setStartTimeInput(formatPlannerTimeInput(defaultMyTime.startTime));
    setEndTimeInput(formatPlannerTimeInput(defaultMyTime.endTime));
    setValidationMessage(null);
  }, [context, defaultMyTime]);

  const shareText = useMemo(() => buildShareText(context, selection), [context, selection]);

  function updateSelection(patch: Partial<RestaurantShareSelection>) {
    setSelection((current) => ({ ...current, ...patch }));
    setValidationMessage(null);
  }

  function updateDateInput(value: string) {
    setDateInput(value);
    updateSelection({ date: parsePlannerDateInput(value) ?? value });
  }

  function normalizeDateInput() {
    const normalizedDate = parsePlannerDateInput(dateInput);
    if (!normalizedDate) {
      return;
    }
    setDateInput(formatPlannerDateInput(normalizedDate));
    updateSelection({ date: normalizedDate });
  }

  function updateTimeInput(field: 'startTime' | 'endTime', value: string) {
    const normalizedTime = parsePlannerTimeInput(value) ?? value;
    if (field === 'startTime') {
      setStartTimeInput(value);
      updateSelection({ startTime: normalizedTime });
    } else {
      setEndTimeInput(value);
      updateSelection({ endTime: normalizedTime });
    }
  }

  function normalizeTimeInput(field: 'startTime' | 'endTime') {
    const input = field === 'startTime' ? startTimeInput : endTimeInput;
    const normalizedTime = parsePlannerTimeInput(input);
    if (!normalizedTime) {
      return;
    }
    const displayTime = formatPlannerTimeInput(normalizedTime);
    if (field === 'startTime') {
      setStartTimeInput(displayTime);
      updateSelection({ startTime: normalizedTime });
    } else {
      setEndTimeInput(displayTime);
      updateSelection({ endTime: normalizedTime });
    }
  }

  function toggleDeal(dealId: number) {
    const selectedDealIds = selection.selectedDealIds.includes(dealId)
      ? selection.selectedDealIds.filter((id) => id !== dealId)
      : [...selection.selectedDealIds, dealId];
    updateSelection({ selectedDealIds });
  }

  async function submit() {
    Keyboard.dismiss();
    if (selection.mode === 'my-time') {
      const normalizedDate = parsePlannerDateInput(dateInput);
      const normalizedStartTime = parsePlannerTimeInput(startTimeInput);
      const normalizedEndTime = parsePlannerTimeInput(endTimeInput);
      const nextValidationMessage = validateCalendarDraft({
        date: normalizedDate ?? dateInput,
        endTime: normalizedEndTime ?? endTimeInput,
        startTime: normalizedStartTime ?? startTimeInput,
      });
      if (nextValidationMessage) {
        setValidationMessage(nextValidationMessage);
        return;
      }

      const normalizedSelection: RestaurantShareSelection = {
        ...selection,
        date: normalizedDate ?? selection.date,
        endTime: normalizedEndTime ?? selection.endTime,
        startTime: normalizedStartTime ?? selection.startTime,
      };
      setSelection(normalizedSelection);
      setDateInput(formatPlannerDateInput(normalizedSelection.date));
      setStartTimeInput(formatPlannerTimeInput(normalizedSelection.startTime));
      setEndTimeInput(formatPlannerTimeInput(normalizedSelection.endTime));
      setSubmitting(true);
      setValidationMessage(null);
      try {
        await onSubmit(normalizedSelection, shareCardRef);
      } catch (error) {
        setValidationMessage(error instanceof Error ? error.message : 'Unable to open the share sheet.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!selection.includeLocation && !selection.includeHappyHours && !selection.includeOperatingHours && !selection.includeDealsAndMenu && !selection.includePhotos) {
      setValidationMessage('Select at least one detail to share.');
      return;
    }

    setSubmitting(true);
    setValidationMessage(null);
    try {
      await onSubmit(selection, shareCardRef);
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : 'Unable to open the share sheet.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.composerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.segmentedControl}>
        <Pressable onPress={() => updateSelection({ mode: 'my-time' })} style={[styles.segment, selection.mode === 'my-time' ? styles.segmentActive : null]}>
          <Text style={[styles.segmentText, selection.mode === 'my-time' ? styles.segmentTextActive : null]}>Share my time</Text>
        </Pressable>
        <Pressable onPress={() => updateSelection({ mode: 'restaurant-details' })} style={[styles.segment, selection.mode === 'restaurant-details' ? styles.segmentActive : null]}>
          <Text style={[styles.segmentText, selection.mode === 'restaurant-details' ? styles.segmentTextActive : null]}>Restaurant details</Text>
        </Pressable>
      </View>

      {selection.mode === 'my-time' ? (
        <View style={styles.myTimeFields}>
          <Text style={styles.sectionLabel}>Your availability</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" onBlur={normalizeDateInput} onChangeText={updateDateInput} placeholder="MM-DD-YYYY" placeholderTextColor={palette.muted} style={styles.input} value={dateInput} />
          <View style={styles.timeRow}>
            <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="default" onBlur={() => normalizeTimeInput('startTime')} onChangeText={(value) => updateTimeInput('startTime', value)} placeholder="Start 3:00 PM" placeholderTextColor={palette.muted} style={[styles.input, styles.timeInput]} value={startTimeInput} />
            <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="default" onBlur={() => normalizeTimeInput('endTime')} onChangeText={(value) => updateTimeInput('endTime', value)} placeholder="End 6:00 PM" placeholderTextColor={palette.muted} style={[styles.input, styles.timeInput]} value={endTimeInput} />
          </View>
        </View>
      ) : (
        <Text style={styles.helperText}>Choose the sections your friend should receive. DiningDealz branding and the business name are always included.</Text>
      )}

      <Text style={styles.sectionLabel}>Include</Text>
      <ShareToggle label="Happy hours and specials" value={selection.includeHappyHours} onChange={(value) => updateSelection({ includeHappyHours: value })} />
      <ShareToggle label="Hours of operation" value={selection.includeOperatingHours} onChange={(value) => updateSelection({ includeOperatingHours: value })} />
      <ShareToggle label="Deals and menu text" value={selection.includeDealsAndMenu} onChange={(value) => updateSelection({ includeDealsAndMenu: value })} />
      <ShareToggle label="Location and map link" value={selection.includeLocation} onChange={(value) => updateSelection({ includeLocation: value })} />
      {context.imageUrls.length ? <ShareToggle label="Photo" value={selection.includePhotos} onChange={(value) => updateSelection({ includePhotos: value })} /> : null}
      {selection.includePhotos && context.imageUrls.length > 1 ? (
        <View style={styles.photoSelectorSection}>
          <Text style={styles.fieldLabel}>Photo to share</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoSelector}>
            {context.imageUrls.map((imageUrl, index) => (
              <Pressable
                accessibilityLabel={`Use photo ${index + 1}`}
                key={imageUrl}
                onPress={() => updateSelection({ selectedPhotoUri: imageUrl })}
                style={[styles.photoSelectorItem, selection.selectedPhotoUri === imageUrl ? styles.photoSelectorItemActive : null]}
              >
                <Image resizeMode="cover" source={{ uri: imageUrl }} style={styles.photoSelectorImage} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {selection.mode === 'restaurant-details' && context.deals.length ? (
        <View style={styles.dealSelectionList}>
          <Text style={styles.fieldLabel}>Deals to include</Text>
          {context.deals.map((deal) => (
            <Pressable key={deal.id} onPress={() => toggleDeal(deal.id)} style={styles.dealSelectionRow}>
              <Ionicons color={selection.selectedDealIds.includes(deal.id) ? palette.accent : palette.muted} name={selection.selectedDealIds.includes(deal.id) ? 'checkbox' : 'square-outline'} size={22} />
              <Text numberOfLines={2} style={styles.dealSelectionText}>{deal.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Preview</Text>
      <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }} style={styles.shareCardCapture}>
        <ShareCardPreview context={context} selection={selection} />
      </ViewShot>
      <Text style={styles.shareTextPreview}>{shareText}</Text>
      {validationMessage ? <Text style={styles.errorText}>{validationMessage}</Text> : null}
      <Text style={styles.disclaimer}>Your device opens the share sheet. DiningDealz never sends the message automatically.</Text>
      <View style={styles.footerActions}>
        <Pressable disabled={submitting} onPress={onClose} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable disabled={submitting} onPress={() => void submit()} style={styles.primaryButton}>
          {submitting ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>Open Share Sheet</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ShareToggle({ label, onChange, value }: { label: string; onChange: (value: boolean) => void; value: boolean }) {
  return (
    <View style={styles.optionRow}>
      <Text style={styles.optionTitle}>{label}</Text>
      <Switch onValueChange={onChange} thumbColor={value ? palette.accent : '#d5d9d6'} trackColor={{ false: '#3c454c', true: '#7a3138' }} value={value} />
    </View>
  );
}

function ShareCardPreview({ context, selection }: { context: PlannerPlaceContext; selection: RestaurantShareSelection }) {
  const photoUri = selection.includePhotos ? selection.selectedPhotoUri ?? context.imageUrls[0] : undefined;
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const selectedDeals = context.deals.filter((deal) => selection.selectedDealIds.includes(deal.id));
  const placeholderIcon = getCategoryIcon(context.venueTypeLabel);

  useEffect(() => {
    setPhotoLoadFailed(false);
  }, [photoUri]);

  return (
    <View style={styles.shareCard}>
      <View style={styles.shareCardBrandRow}>
        <Image resizeMode="contain" source={require('../../assets/DiningDealz-Logo-Transparent.png')} style={styles.shareCardLogo} />
        <Text style={styles.shareCardBrand}>DiningDealz</Text>
      </View>
      {photoUri && !photoLoadFailed ? (
        <Image onError={() => setPhotoLoadFailed(true)} resizeMode="cover" source={{ uri: photoUri }} style={styles.shareCardPhoto} />
      ) : (
        <View style={styles.shareCardPlaceholder}>
          <MaterialCommunityIcons color="#ff6970" name={placeholderIcon} size={44} />
        </View>
      )}
      <Text style={styles.shareCardName}>{context.name}</Text>
      <Text style={styles.shareCardMeta}>{[context.cityLabel, context.venueTypeLabel].filter(Boolean).join(' · ')}</Text>
      {selection.mode === 'my-time' ? (
        <Text style={styles.shareCardDetail}>{[selection.date ? formatPlannerDateInput(selection.date) : '', selection.startTime && selection.endTime ? `${formatPlannerTimeInput(selection.startTime)} - ${formatPlannerTimeInput(selection.endTime)}` : ''].filter(Boolean).join('\n')}</Text>
      ) : (
        <Text numberOfLines={5} style={styles.shareCardDetail}>
          {[
            selection.includeHappyHours ? 'Happy hours and specials' : '',
            selection.includeOperatingHours ? 'Hours of operation' : '',
            selection.includeDealsAndMenu ? selectedDeals.map((deal) => deal.title).join(', ') : '',
            selection.includeLocation ? context.address : '',
          ].filter(Boolean).join('\n')}
        </Text>
      )}
    </View>
  );
}

function getCategoryIcon(label: string): 'cup' | 'silverware-fork-knife' | 'glass-cocktail' | 'storefront-outline' | 'bus' | 'star-four-points' {
  const normalized = label.toLowerCase();
  if (normalized.includes('cafe') || normalized.includes('coffee')) {
    return 'cup';
  }
  if (normalized.includes('bar') || normalized.includes('wine')) {
    return 'glass-cocktail';
  }
  if (normalized.includes('shop') || normalized.includes('store')) {
    return 'storefront-outline';
  }
  if (normalized.includes('mobile') || normalized.includes('vendor')) {
    return 'bus';
  }
  if (normalized.includes('attraction')) {
    return 'star-four-points';
  }
  return 'silverware-fork-knife';
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    ...StyleSheet.absoluteFillObject,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  composerContent: {
    paddingBottom: 28,
  },
  dealSelectionList: {
    gap: 9,
    marginTop: 18,
  },
  dealSelectionRow: {
    alignItems: 'center',
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dealSelectionText: {
    color: palette.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  disclaimer: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 16,
  },
  errorText: {
    color: '#ff969b',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 10,
  },
  fieldLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  helperText: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
  },
  input: {
    backgroundColor: '#171d22',
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    color: palette.text,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalCard: {
    backgroundColor: palette.background,
    borderColor: palette.border,
    borderRadius: 24,
    borderWidth: 1,
    maxHeight: '90%',
    paddingHorizontal: 18,
    paddingTop: 18,
    width: '94%',
  },
  modalEyebrow: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalRoot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  modalSubtitle: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  modalTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
  },
  modalTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  myTimeFields: {
    gap: 8,
  },
  optionCopy: {
    flex: 1,
    paddingRight: 14,
  },
  optionRow: {
    alignItems: 'center',
    borderBottomColor: '#2c343b',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 56,
  },
  optionSubtitle: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  optionTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  photoSelector: {
    gap: 8,
    paddingVertical: 2,
  },
  photoSelectorImage: {
    borderRadius: 10,
    height: 68,
    width: 88,
  },
  photoSelectorItem: {
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 2,
  },
  photoSelectorItemActive: {
    borderColor: palette.accent,
    borderWidth: 2,
  },
  photoSelectorSection: {
    marginTop: 10,
  },
  presetButton: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  presetButtonActive: {
    backgroundColor: '#43292e',
    borderColor: palette.accent,
  },
  presetList: {
    gap: 8,
    marginBottom: 16,
  },
  presetMeta: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 3,
  },
  presetTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  presetTitleActive: {
    color: '#ffb4b7',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: palette.accent,
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionLabel: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 16,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 8,
  },
  segmentActive: {
    backgroundColor: palette.accent,
  },
  segmentText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  segmentedControl: {
    backgroundColor: '#1a2025',
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  shareCard: {
    backgroundColor: '#1a2222',
    borderColor: '#52625a',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 14,
  },
  shareCardBrand: {
    color: '#ff6970',
    fontSize: 13,
    fontWeight: '800',
  },
  shareCardBrandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  shareCardCapture: {
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
  shareCardDetail: {
    color: '#e6ede8',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    paddingHorizontal: 14,
  },
  shareCardLogo: {
    height: 28,
    width: 28,
  },
  shareCardMeta: {
    color: '#a8b9b0',
    fontSize: 12,
    paddingHorizontal: 14,
  },
  shareCardName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 10,
    paddingHorizontal: 14,
  },
  shareCardPhoto: {
    height: 124,
    width: '100%',
  },
  shareCardPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#27332e',
    height: 124,
    justifyContent: 'center',
  },
  shareTextPreview: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 9,
  },
  timeField: {
    flex: 1,
  },
  timeInput: {
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
});
