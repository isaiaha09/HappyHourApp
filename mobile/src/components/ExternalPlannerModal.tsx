import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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
  View,
} from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import {
  buildCalendarDraftFromParts,
  buildCalendarNotes,
  formatDateLabel,
  formatPlannerDateInput,
  formatPlannerTimeInput,
  formatTimeLabel,
  getDefaultCalendarSelection,
  getDefaultShareSelection,
  getPlannerShareCardDetails,
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
  theme?: 'dark' | 'light';
  visible: boolean;
};

type PlannerPalette = {
  accent: string;
  background: string;
  border: string;
  card: string;
  divider: string;
  input: string;
  muted: string;
  text: string;
  backdrop: string;
  error: string;
  activeCard: string;
  activeText: string;
  shareCard: string;
  shareCardBorder: string;
  shareCardDetail: string;
  shareCardMeta: string;
  shareCardPlaceholder: string;
  switchOffTrack: string;
  switchOnTrack: string;
  switchOffThumb: string;
};

const darkPalette: PlannerPalette = {
  accent: '#ff5b61',
  activeCard: '#43292e',
  activeText: '#ffb4b7',
  background: '#11161b',
  backdrop: 'rgba(0, 0, 0, 0.58)',
  border: '#39434c',
  card: '#20272e',
  divider: '#2c343b',
  error: '#ff969b',
  input: '#171d22',
  muted: '#a8b0b6',
  shareCard: '#1a2222',
  shareCardBorder: '#52625a',
  shareCardDetail: '#e6ede8',
  shareCardMeta: '#a8b9b0',
  shareCardPlaceholder: '#27332e',
  switchOffThumb: '#d5d9d6',
  switchOffTrack: '#3c454c',
  switchOnTrack: '#7a3138',
  text: '#f7f8f5',
};

const lightPalette: PlannerPalette = {
  accent: '#f64f58',
  activeCard: '#ffe1e2',
  activeText: '#b42632',
  background: '#f7f8f5',
  backdrop: 'rgba(20, 28, 24, 0.28)',
  border: '#cbd4ce',
  card: '#ffffff',
  divider: '#dce3de',
  error: '#b32632',
  input: '#ffffff',
  muted: '#59645d',
  shareCard: '#ffffff',
  shareCardBorder: '#cbd4ce',
  shareCardDetail: '#25302a',
  shareCardMeta: '#59645d',
  shareCardPlaceholder: '#e4eee7',
  switchOffThumb: '#ffffff',
  switchOffTrack: '#b8c2bb',
  switchOnTrack: '#f7a1a5',
  text: '#17201c',
};

// The base StyleSheet values keep the existing dark-mode layout stable. Every
// rendered color-bearing style is layered with getPlannerColorStyles so the
// active map theme wins at runtime.
const palette = darkPalette;

function getPlannerPalette(theme: 'dark' | 'light'): PlannerPalette {
  return theme === 'light' ? lightPalette : darkPalette;
}

function getPlannerColorStyles(palette: PlannerPalette) {
  return {
    backdrop: { backgroundColor: palette.backdrop },
    closeButton: { backgroundColor: palette.card, borderColor: palette.border },
    dealSelectionRow: { backgroundColor: palette.card, borderColor: palette.border },
    dealSelectionText: { color: palette.text },
    disclaimer: { color: palette.muted },
    errorText: { color: palette.error },
    fieldLabel: { color: palette.muted },
    helperText: { color: palette.muted },
    input: { backgroundColor: palette.input, borderColor: palette.border, color: palette.text },
    nativePickerValue: { color: palette.text },
    modalCard: { backgroundColor: palette.background, borderColor: palette.border },
    modalEyebrow: { color: palette.accent },
    modalSubtitle: { color: palette.muted },
    modalTitle: { color: palette.text },
    optionRow: { borderBottomColor: palette.divider },
    optionSubtitle: { color: palette.muted },
    optionTitle: { color: palette.text },
    photoSelectorItem: { borderColor: palette.border },
    photoSelectorItemActive: { borderColor: palette.accent },
    presetButton: { backgroundColor: palette.card, borderColor: palette.border },
    presetButtonActive: { backgroundColor: palette.activeCard, borderColor: palette.accent },
    presetMeta: { color: palette.muted },
    presetTitle: { color: palette.text },
    presetTitleActive: { color: palette.activeText },
    primaryButton: { backgroundColor: palette.accent },
    secondaryButton: { borderColor: palette.border },
    secondaryButtonText: { color: palette.text },
    sectionLabel: { color: palette.text },
    segmentActive: { backgroundColor: palette.accent },
    segmentText: { color: palette.muted },
    segmentedControl: { backgroundColor: palette.card, borderColor: palette.border },
    shareCard: { backgroundColor: palette.shareCard, borderColor: palette.shareCardBorder },
    shareCardBrand: { color: palette.accent },
    shareCardDetail: { color: palette.shareCardDetail },
    shareCardMeta: { color: palette.shareCardMeta },
    shareCardName: { color: palette.text },
    shareCardPlaceholder: { backgroundColor: palette.shareCardPlaceholder },
  };
}

function plannerDatePickerValue(value: string | undefined) {
  const normalized = parsePlannerDateInput(value);
  if (!normalized) {
    return new Date();
  }
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function plannerTimePickerValue(value: string | undefined) {
  const normalized = parsePlannerTimeInput(value ?? '');
  const [hour, minute] = (normalized ?? '09:00').split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute, 0, 0);
}

function pickerDateToPlannerDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function pickerTimeToPlannerTime(value: Date) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export function ExternalPlannerModal({
  context,
  errorMessage,
  mode,
  onCalendarSubmit,
  onClose,
  onShareSubmit,
  theme,
  visible,
}: ExternalPlannerModalProps) {
  if (!context) {
    return null;
  }

  const palette = getPlannerPalette(theme ?? context.theme ?? 'dark');
  const colorStyles = getPlannerColorStyles(palette);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <View style={[styles.backdrop, colorStyles.backdrop]} />
        <View style={[styles.modalCard, colorStyles.modalCard]}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleCopy}>
              <Text style={[styles.modalEyebrow, colorStyles.modalEyebrow]}>DiningDealz</Text>
              <Text style={[styles.modalTitle, colorStyles.modalTitle]}>{mode === 'calendar' ? 'Add to Calendar' : 'Share Restaurant'}</Text>
              <Text numberOfLines={1} style={[styles.modalSubtitle, colorStyles.modalSubtitle]}>{context.name}</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={[styles.closeButton, colorStyles.closeButton]}>
              <Ionicons color={palette.text} name="close" size={21} />
            </Pressable>
          </View>

          {errorMessage ? <Text style={[styles.errorText, colorStyles.errorText]}>{errorMessage}</Text> : null}

          {mode === 'calendar' ? (
            <CalendarComposer context={context} onClose={onClose} onSubmit={onCalendarSubmit} palette={palette} />
          ) : (
            <ShareComposer context={context} onClose={onClose} onSubmit={onShareSubmit} palette={palette} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type PlannerPickerKind = 'date' | 'startTime' | 'endTime';

type CalendarComposerProps = {
  context: PlannerPlaceContext;
  onClose: () => void;
  onSubmit: (draft: CalendarEventDraft) => Promise<void> | void;
  palette: PlannerPalette;
};

function CalendarComposer({ context, onClose, onSubmit, palette }: CalendarComposerProps) {
  const colorStyles = getPlannerColorStyles(palette);
  const schedules = useMemo(() => getPlannerSchedules(context), [context]);
  const initialSelection = useMemo(() => getDefaultCalendarSelection(context), [context]);
  const [date, setDate] = useState(initialSelection.date);
  const [startTime, setStartTime] = useState(initialSelection.startTime);
  const [endTime, setEndTime] = useState(initialSelection.endTime);
  const [allDay, setAllDay] = useState(initialSelection.allDay);
  const [weeklyRepeat, setWeeklyRepeat] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState(initialSelection.scheduleId ?? 'custom');
  const [pickerKind, setPickerKind] = useState<PlannerPickerKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    setDate(initialSelection.date);
    setStartTime(initialSelection.startTime);
    setEndTime(initialSelection.endTime);
    setAllDay(initialSelection.allDay);
    setSelectedScheduleId(initialSelection.scheduleId ?? 'custom');
    setPickerKind(null);
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
    setPickerKind(null);
    setValidationMessage(null);
  }

  function handlePickerChange(event: DateTimePickerEvent, nextDate?: Date) {
    if (!nextDate || event.type === 'dismissed') {
      setPickerKind(null);
      return;
    }

    if (pickerKind === 'date') {
      setDate(pickerDateToPlannerDate(nextDate));
    } else if (pickerKind === 'startTime') {
      setStartTime(pickerTimeToPlannerTime(nextDate));
    } else if (pickerKind === 'endTime') {
      setEndTime(pickerTimeToPlannerTime(nextDate));
    }

    if (Platform.OS !== 'ios') {
      setPickerKind(null);
    }
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
      <Text style={[styles.sectionLabel, colorStyles.sectionLabel]}>Choose a time</Text>
      <View style={styles.presetList}>
        {schedules.map((schedule) => (
          <Pressable
            accessibilityRole="button"
            key={schedule.id}
            onPress={() => selectSchedule(schedule)}
            style={[styles.presetButton, colorStyles.presetButton, selectedScheduleId === schedule.id ? [styles.presetButtonActive, colorStyles.presetButtonActive] : null]}
          >
            <Text style={[styles.presetTitle, colorStyles.presetTitle, selectedScheduleId === schedule.id ? [styles.presetTitleActive, colorStyles.presetTitleActive] : null]}>{schedule.label}</Text>
            <Text style={[styles.presetMeta, colorStyles.presetMeta]}>
              {[schedule.weekdayLabel, schedule.allDay ? 'All day' : `${formatTimeLabel(schedule.startTime)} - ${formatTimeLabel(schedule.endTime)}`].filter(Boolean).join(' · ')}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            setSelectedScheduleId('custom');
            setPickerKind(null);
            setValidationMessage(null);
          }}
          style={[styles.presetButton, colorStyles.presetButton, selectedScheduleId === 'custom' ? [styles.presetButtonActive, colorStyles.presetButtonActive] : null]}
        >
          <Text style={[styles.presetTitle, colorStyles.presetTitle, selectedScheduleId === 'custom' ? [styles.presetTitleActive, colorStyles.presetTitleActive] : null]}>Custom time</Text>
          <Text style={[styles.presetMeta, colorStyles.presetMeta]}>Enter your own availability</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, colorStyles.sectionLabel]}>Date</Text>
      <Pressable
        accessibilityLabel="Choose calendar date"
        accessibilityRole="button"
        onPress={() => setPickerKind('date')}
        style={[styles.input, styles.nativePickerField, colorStyles.input]}
      >
        <Text style={[styles.nativePickerValue, colorStyles.nativePickerValue]}>
          {date ? formatPlannerDateInput(date) : 'Choose date'}
        </Text>
        <Ionicons color={palette.muted} name="calendar-outline" size={19} />
      </Pressable>
      <Text style={[styles.helperText, colorStyles.helperText]}>{date ? formatDateLabel(date) : 'Use the date you plan to visit.'}</Text>

      <View style={styles.timeRow}>
        <View style={styles.timeFieldRow}>
          <Text style={[styles.fieldLabel, styles.timeFieldRowLabel, colorStyles.fieldLabel]}>Start</Text>
          <Pressable
            accessibilityLabel="Choose calendar start time"
            accessibilityRole="button"
            disabled={allDay}
            onPress={() => setPickerKind('startTime')}
            style={[styles.input, styles.nativePickerField, styles.timeInputAligned, colorStyles.input, allDay ? styles.disabledPickerField : null]}
          >
            <Text style={[styles.nativePickerValue, colorStyles.nativePickerValue]}>
              {startTime ? formatPlannerTimeInput(startTime) : 'Choose start'}
            </Text>
            <Ionicons color={palette.muted} name="time-outline" size={19} />
          </Pressable>
        </View>
        <View style={styles.timeFieldRow}>
          <Text style={[styles.fieldLabel, styles.timeFieldRowLabel, colorStyles.fieldLabel]}>End</Text>
          <Pressable
            accessibilityLabel="Choose calendar end time"
            accessibilityRole="button"
            disabled={allDay}
            onPress={() => setPickerKind('endTime')}
            style={[styles.input, styles.nativePickerField, styles.timeInputAligned, colorStyles.input, allDay ? styles.disabledPickerField : null]}
          >
            <Text style={[styles.nativePickerValue, colorStyles.nativePickerValue]}>
              {endTime ? formatPlannerTimeInput(endTime) : 'Choose end'}
            </Text>
            <Ionicons color={palette.muted} name="time-outline" size={19} />
          </Pressable>
        </View>
      </View>
      {pickerKind ? (
        <View style={[styles.nativePickerPanel, colorStyles.dealSelectionRow]}>
          <DateTimePicker
            accentColor={palette.accent}
            display={Platform.OS === 'ios' ? (pickerKind === 'date' ? 'inline' : 'spinner') : 'default'}
            is24Hour={Platform.OS === 'android' ? false : undefined}
            locale={Platform.OS === 'ios' ? 'en_US' : undefined}
            mode={pickerKind === 'date' ? 'date' : 'time'}
            onChange={handlePickerChange}
            themeVariant={Platform.OS === 'ios' ? (palette === lightPalette ? 'light' : 'dark') : undefined}
            value={pickerKind === 'date'
              ? plannerDatePickerValue(date)
              : plannerTimePickerValue(pickerKind === 'startTime' ? startTime : endTime)}
          />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setPickerKind(null)} style={[styles.pickerDoneButton, colorStyles.primaryButton]}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.optionRow, colorStyles.optionRow]}>
        <View style={styles.optionCopy}>
          <Text style={[styles.optionTitle, colorStyles.optionTitle]}>All-day event</Text>
          <Text style={[styles.optionSubtitle, colorStyles.optionSubtitle]}>Use this for an all-day schedule.</Text>
        </View>
        <Switch
          onValueChange={(value) => {
            setAllDay(value);
            if (value) {
              setPickerKind(null);
            }
          }}
          thumbColor={allDay ? palette.accent : palette.switchOffThumb}
          trackColor={{ false: palette.switchOffTrack, true: palette.switchOnTrack }}
          value={allDay}
        />
      </View>
      <View style={[styles.optionRow, colorStyles.optionRow]}>
        <View style={styles.optionCopy}>
          <Text style={[styles.optionTitle, colorStyles.optionTitle]}>Repeat weekly</Text>
          <Text style={[styles.optionSubtitle, colorStyles.optionSubtitle]}>Off by default. You can edit it in your calendar.</Text>
        </View>
        <Switch onValueChange={setWeeklyRepeat} thumbColor={weeklyRepeat ? palette.accent : palette.switchOffThumb} trackColor={{ false: palette.switchOffTrack, true: palette.switchOnTrack }} value={weeklyRepeat} />
      </View>

      {validationMessage ? <Text style={[styles.errorText, colorStyles.errorText]}>{validationMessage}</Text> : null}
      <Text style={[styles.disclaimer, colorStyles.disclaimer]}>DiningDealz opens your device calendar editor. We do not read your existing calendars.</Text>
      <View style={styles.footerActions}>
        <Pressable disabled={submitting} onPress={onClose} style={[styles.secondaryButton, colorStyles.secondaryButton]}>
          <Text style={[styles.secondaryButtonText, colorStyles.secondaryButtonText]}>Cancel</Text>
        </Pressable>
        <Pressable disabled={submitting} onPress={() => void submit()} style={[styles.primaryButton, colorStyles.primaryButton]}>
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
  palette: PlannerPalette;
};

function ShareComposer({ context, onClose, onSubmit, palette }: ShareComposerProps) {
  const colorStyles = getPlannerColorStyles(palette);
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
  const [pickerKind, setPickerKind] = useState<PlannerPickerKind | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSelection({
      ...getDefaultShareSelection(context),
      date: defaultMyTime.date,
      endTime: defaultMyTime.endTime,
      startTime: defaultMyTime.startTime,
    });
    setPickerKind(null);
    setValidationMessage(null);
  }, [context, defaultMyTime]);

  function updateSelection(patch: Partial<RestaurantShareSelection>) {
    setSelection((current) => ({ ...current, ...patch }));
    setValidationMessage(null);
  }

  function handlePickerChange(event: DateTimePickerEvent, nextDate?: Date) {
    if (!nextDate || event.type === 'dismissed') {
      setPickerKind(null);
      return;
    }

    if (pickerKind === 'date') {
      updateSelection({ date: pickerDateToPlannerDate(nextDate) });
    } else if (pickerKind === 'startTime') {
      updateSelection({ startTime: pickerTimeToPlannerTime(nextDate) });
    } else if (pickerKind === 'endTime') {
      updateSelection({ endTime: pickerTimeToPlannerTime(nextDate) });
    }

    if (Platform.OS !== 'ios') {
      setPickerKind(null);
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
      const nextValidationMessage = validateCalendarDraft({
        date: selection.date ?? '',
        endTime: selection.endTime ?? '',
        startTime: selection.startTime ?? '',
      });
      if (nextValidationMessage) {
        setValidationMessage(nextValidationMessage);
        return;
      }

      const normalizedSelection: RestaurantShareSelection = {
        ...selection,
        date: selection.date,
        endTime: selection.endTime,
        startTime: selection.startTime,
      };
      setSelection(normalizedSelection);
      setPickerKind(null);
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
      <View style={[styles.segmentedControl, colorStyles.segmentedControl]}>
        <Pressable onPress={() => updateSelection({ mode: 'my-time' })} style={[styles.segment, selection.mode === 'my-time' ? [styles.segmentActive, colorStyles.segmentActive] : null]}>
          <Text style={[styles.segmentText, colorStyles.segmentText, selection.mode === 'my-time' ? styles.segmentTextActive : null]}>Share my time</Text>
        </Pressable>
        <Pressable onPress={() => updateSelection({ mode: 'restaurant-details' })} style={[styles.segment, selection.mode === 'restaurant-details' ? [styles.segmentActive, colorStyles.segmentActive] : null]}>
          <Text style={[styles.segmentText, colorStyles.segmentText, selection.mode === 'restaurant-details' ? styles.segmentTextActive : null]}>Restaurant details</Text>
        </Pressable>
      </View>

      {selection.mode === 'my-time' ? (
        <View style={styles.myTimeFields}>
          <Text style={[styles.sectionLabel, colorStyles.sectionLabel]}>Your availability</Text>
          <Pressable
            accessibilityLabel="Choose availability date"
            accessibilityRole="button"
            onPress={() => {
              Keyboard.dismiss();
              setPickerKind('date');
            }}
            style={[styles.input, styles.nativePickerField, colorStyles.input]}
          >
            <Text style={[styles.nativePickerValue, colorStyles.nativePickerValue]}>
              {selection.date ? formatPlannerDateInput(selection.date) : 'Choose date'}
            </Text>
            <Ionicons color={palette.muted} name="calendar-outline" size={19} />
          </Pressable>
          <View style={styles.timeRow}>
            <View style={styles.timeFieldRow}>
              <Text style={[styles.fieldLabel, styles.timeFieldRowLabel, colorStyles.fieldLabel]}>Start</Text>
              <Pressable
                accessibilityLabel="Choose availability start time"
                accessibilityRole="button"
                onPress={() => {
                  Keyboard.dismiss();
                  setPickerKind('startTime');
                }}
                style={[styles.input, styles.nativePickerField, styles.timeInputAligned, colorStyles.input]}
              >
                <Text style={[styles.nativePickerValue, colorStyles.nativePickerValue]}>
                  {selection.startTime ? formatPlannerTimeInput(selection.startTime) : 'Choose start'}
                </Text>
                <Ionicons color={palette.muted} name="time-outline" size={19} />
              </Pressable>
            </View>
            <View style={styles.timeFieldRow}>
              <Text style={[styles.fieldLabel, styles.timeFieldRowLabel, colorStyles.fieldLabel]}>End</Text>
              <Pressable
                accessibilityLabel="Choose availability end time"
                accessibilityRole="button"
                onPress={() => {
                  Keyboard.dismiss();
                  setPickerKind('endTime');
                }}
                style={[styles.input, styles.nativePickerField, styles.timeInputAligned, colorStyles.input]}
              >
                <Text style={[styles.nativePickerValue, colorStyles.nativePickerValue]}>
                  {selection.endTime ? formatPlannerTimeInput(selection.endTime) : 'Choose end'}
                </Text>
                <Ionicons color={palette.muted} name="time-outline" size={19} />
              </Pressable>
            </View>
          </View>
          {pickerKind ? (
            <View style={[styles.nativePickerPanel, colorStyles.dealSelectionRow]}>
              <DateTimePicker
                accentColor={palette.accent}
                display={Platform.OS === 'ios' ? (pickerKind === 'date' ? 'inline' : 'spinner') : 'default'}
                is24Hour={Platform.OS === 'android' ? false : undefined}
                locale={Platform.OS === 'ios' ? 'en_US' : undefined}
                mode={pickerKind === 'date' ? 'date' : 'time'}
                onChange={handlePickerChange}
                themeVariant={Platform.OS === 'ios' ? (palette === lightPalette ? 'light' : 'dark') : undefined}
                value={pickerKind === 'date'
                  ? plannerDatePickerValue(selection.date)
                  : plannerTimePickerValue(pickerKind === 'startTime' ? selection.startTime : selection.endTime)}
              />
              {Platform.OS === 'ios' ? (
                <Pressable onPress={() => setPickerKind(null)} style={[styles.pickerDoneButton, colorStyles.primaryButton]}>
                  <Text style={styles.primaryButtonText}>Done</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.helperText, colorStyles.helperText]}>Choose the sections your friend should receive. DiningDealz branding and the business name are always included.</Text>
      )}

      <Text style={[styles.sectionLabel, colorStyles.sectionLabel]}>Include</Text>
      <ShareToggle label="Happy Hours and Deals" value={selection.includeHappyHours} onChange={(value) => updateSelection({ includeHappyHours: value })} palette={palette} />
      <ShareToggle label="Hours of operation" value={selection.includeOperatingHours} onChange={(value) => updateSelection({ includeOperatingHours: value })} palette={palette} />
      <ShareToggle label="Specials and Menu" value={selection.includeDealsAndMenu} onChange={(value) => updateSelection({ includeDealsAndMenu: value })} palette={palette} />
      <ShareToggle label="Location and map link" value={selection.includeLocation} onChange={(value) => updateSelection({ includeLocation: value })} palette={palette} />
      {context.imageUrls.length ? <ShareToggle label="Photo" value={selection.includePhotos} onChange={(value) => updateSelection({ includePhotos: value })} palette={palette} /> : null}
      {selection.includePhotos && context.imageUrls.length > 1 ? (
        <View style={styles.photoSelectorSection}>
          <Text style={[styles.fieldLabel, colorStyles.fieldLabel]}>Photo to share</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoSelector}>
            {context.imageUrls.map((imageUrl, index) => (
              <Pressable
                accessibilityLabel={`Use photo ${index + 1}`}
                key={imageUrl}
                onPress={() => updateSelection({ selectedPhotoUri: imageUrl })}
                style={[styles.photoSelectorItem, colorStyles.photoSelectorItem, selection.selectedPhotoUri === imageUrl ? [styles.photoSelectorItemActive, colorStyles.photoSelectorItemActive] : null]}
              >
                <Image resizeMode="cover" source={{ uri: imageUrl }} style={styles.photoSelectorImage} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {selection.mode === 'restaurant-details' && context.deals.length ? (
        <View style={styles.dealSelectionList}>
          <Text style={[styles.fieldLabel, colorStyles.fieldLabel]}>Specials and Menu to include</Text>
          {context.deals.map((deal) => (
            <Pressable key={deal.id} onPress={() => toggleDeal(deal.id)} style={[styles.dealSelectionRow, colorStyles.dealSelectionRow]}>
              <Ionicons color={selection.selectedDealIds.includes(deal.id) ? palette.accent : palette.muted} name={selection.selectedDealIds.includes(deal.id) ? 'checkbox' : 'square-outline'} size={22} />
              <Text numberOfLines={2} style={[styles.dealSelectionText, colorStyles.dealSelectionText]}>{deal.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, colorStyles.sectionLabel]}>Preview</Text>
      <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }} style={styles.shareCardCapture}>
        <ShareCardPreview context={context} selection={selection} palette={palette} />
      </ViewShot>
      {validationMessage ? <Text style={[styles.errorText, colorStyles.errorText]}>{validationMessage}</Text> : null}
      <Text style={[styles.disclaimer, colorStyles.disclaimer]}>Your device opens the share sheet. DiningDealz never sends the message automatically.</Text>
      <View style={styles.footerActions}>
        <Pressable disabled={submitting} onPress={onClose} style={[styles.secondaryButton, colorStyles.secondaryButton]}>
          <Text style={[styles.secondaryButtonText, colorStyles.secondaryButtonText]}>Cancel</Text>
        </Pressable>
        <Pressable disabled={submitting} onPress={() => void submit()} style={[styles.primaryButton, colorStyles.primaryButton]}>
          {submitting ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>Open Share Sheet</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ShareToggle({ label, onChange, palette, value }: { label: string; onChange: (value: boolean) => void; palette: PlannerPalette; value: boolean }) {
  const colorStyles = getPlannerColorStyles(palette);

  return (
    <View style={[styles.optionRow, colorStyles.optionRow]}>
      <Text style={[styles.optionTitle, colorStyles.optionTitle]}>{label}</Text>
      <Switch onValueChange={onChange} thumbColor={value ? palette.accent : palette.switchOffThumb} trackColor={{ false: palette.switchOffTrack, true: palette.switchOnTrack }} value={value} />
    </View>
  );
}

function ShareCardPreview({ context, palette, selection }: { context: PlannerPlaceContext; palette: PlannerPalette; selection: RestaurantShareSelection }) {
  const colorStyles = getPlannerColorStyles(palette);
  const photoUri = selection.includePhotos ? selection.selectedPhotoUri ?? context.imageUrls[0] : undefined;
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const cardDetails = getPlannerShareCardDetails(context, selection);
  const placeholderIcon = getCategoryIcon(context.venueTypeLabel);

  useEffect(() => {
    setPhotoLoadFailed(false);
  }, [photoUri]);

  return (
    <View style={[styles.shareCard, colorStyles.shareCard]}>
      <View style={styles.shareCardBrandRow}>
        <Image resizeMode="contain" source={require('../../assets/DiningDealz-Logo-Transparent.png')} style={styles.shareCardLogo} />
        <Text style={[styles.shareCardBrand, colorStyles.shareCardBrand]}>DiningDealz</Text>
      </View>
      {photoUri && !photoLoadFailed ? (
        <Image onError={() => setPhotoLoadFailed(true)} resizeMode="cover" source={{ uri: photoUri }} style={styles.shareCardPhoto} />
      ) : (
        <View style={[styles.shareCardPlaceholder, colorStyles.shareCardPlaceholder]}>
          <MaterialCommunityIcons color={palette.accent} name={placeholderIcon} size={44} />
        </View>
      )}
      <Text style={[styles.shareCardName, colorStyles.shareCardName]}>{context.name}</Text>
      <Text style={[styles.shareCardMeta, colorStyles.shareCardMeta]}>{[context.cityLabel, context.venueTypeLabel].filter(Boolean).join(' · ')}</Text>
      <Text style={[styles.shareCardDetail, colorStyles.shareCardDetail]}>{cardDetails.join('\n')}</Text>
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
  disabledPickerField: {
    opacity: 0.55,
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
  nativePickerField: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nativePickerPanel: {
    alignItems: 'stretch',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 2,
    overflow: 'hidden',
    padding: 8,
  },
  nativePickerValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
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
  pickerDoneButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 40,
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
  timeFieldRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  timeFieldRowLabel: {
    marginBottom: 0,
    textTransform: 'none',
  },
  timeInputAligned: {
    flex: 0,
    minWidth: 150,
  },
  timeRow: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 10,
  },
});
