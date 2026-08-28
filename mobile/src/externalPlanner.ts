import type {
  CurrentHappyHourPlace,
  CurrentHappyHourWindow,
  Deal,
  HappyHourWindow,
  OperatingHourWindow,
  PlaceDetail,
  PlaceLocationDetail,
} from './types';

export type PlaceActionReference = {
  slug: string;
  locationId?: number;
  dealId?: number;
  happyHourWindowId?: number;
};

export type CalendarEventDraft = {
  title: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  location?: string;
  notes: string;
  weeklyRepeat?: boolean;
  allDay?: boolean;
};

export type RestaurantShareSelection = {
  mode: 'my-time' | 'restaurant-details';
  date?: string;
  startTime?: string;
  endTime?: string;
  includeHappyHours: boolean;
  includeOperatingHours: boolean;
  includeDealsAndMenu: boolean;
  includePhotos: boolean;
  includeLocation: boolean;
  selectedDealIds: number[];
  selectedPhotoUri?: string;
};

export type PlannerSchedule = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  weekday?: number;
  weekdayLabel?: string;
  kind: 'happy-hour' | 'operating-hours';
  dealId?: number;
  dealTitle?: string;
};

export type PlannerDeal = {
  id: number;
  title: string;
  description: string;
  priceText: string;
  terms: string;
  dealTypeLabel: string;
  happyHours: PlannerSchedule[];
  menuText?: string;
  imageUrl?: string;
};

export type PlannerPlaceContext = {
  reference: PlaceActionReference;
  name: string;
  cityLabel: string;
  venueTypeLabel: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  imageUrls: string[];
  timeZone: string;
  schedules: PlannerSchedule[];
  theme?: 'dark' | 'light';
  deals: PlannerDeal[];
};

export type PlannerContentTitles = {
  happyHourTitles: string[];
  dealTitles: string[];
};

export type BusinessProfileLinks = {
  app?: string;
  iosProfile?: string;
  iosStore?: string;
  androidStore?: string;
};

const diningDealzDefaultIOSProfileLinkBaseURL = 'https://link.diningdealz.com/share/place';

function getDiningDealzIOSProfileLinkBaseURL() {
  const configured = process.env.EXPO_PUBLIC_IOS_PROFILE_LINK_BASE_URL?.trim();
  if (!configured) {
    return diningDealzDefaultIOSProfileLinkBaseURL;
  }

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'link.diningdealz.com') {
      return diningDealzDefaultIOSProfileLinkBaseURL;
    }
    return configured.replace(/\/+$/, '');
  } catch {
    return diningDealzDefaultIOSProfileLinkBaseURL;
  }
}

function getDiningDealzIOSAppStoreURL() {
  const configured = process.env.EXPO_PUBLIC_IOS_APP_STORE_URL?.trim();
  if (!configured) {
    return '';
  }

  try {
    const parsed = new URL(configured);
    const path = parsed.pathname.toLowerCase();
    if (
      parsed.protocol !== 'https:'
      || parsed.hostname.toLowerCase() !== 'apps.apple.com'
      || !path.includes('/app/')
      || !/\/id\d+/.test(path)
    ) {
      return '';
    }
    return configured;
  } catch {
    return '';
  }
}

const diningDealzIOSAppStoreURL = getDiningDealzIOSAppStoreURL();
const diningDealzAndroidStoreURL = process.env.EXPO_PUBLIC_ANDROID_APP_STORE_URL?.trim() || '';

type DateParts = {
  date: string;
  time: string;
};

const timePattern = /^(\d{1,2}):([0-5]\d)(?::\d{2})?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const plannerDateInputPattern = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
const plannerTimeInputPattern = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getTodayDateString(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatTimeLabel(value: string | undefined | null) {
  if (!value) {
    return '';
  }

  const match = value.trim().match(timePattern);
  if (!match) {
    return value;
  }

  const hour = Number(match[1]);
  const minutes = match[2];
  if (hour < 0 || hour > 23) {
    return value;
  }

  return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function formatDateLabel(value: string | undefined | null) {
  if (!value || !datePattern.test(value)) {
    return value ?? '';
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Formats the share composer date without changing the ISO date used by the
 * calendar and native bridge layers.
 */
export function formatPlannerDateInput(value: string | undefined | null) {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return '';
  }

  if (datePattern.test(normalized) && isValidDateString(normalized)) {
    const [year, month, day] = normalized.split('-');
    return `${month}-${day}-${year}`;
  }

  const match = normalized.match(plannerDateInputPattern);
  if (!match) {
    return normalized;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const isoDate = `${year}-${pad(month)}-${pad(day)}`;
  return isValidDateString(isoDate) ? `${pad(month)}-${pad(day)}-${year}` : normalized;
}

/** Converts either the share display format or an ISO date to YYYY-MM-DD. */
export function parsePlannerDateInput(value: string | undefined | null) {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return null;
  }

  if (datePattern.test(normalized)) {
    return isValidDateString(normalized) ? normalized : null;
  }

  const match = normalized.match(plannerDateInputPattern);
  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const isoDate = `${year}-${pad(month)}-${pad(day)}`;
  return isValidDateString(isoDate) ? isoDate : null;
}

function plannerTimeParts(value: string | undefined | null) {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return null;
  }

  const twelveHourMatch = normalized.match(plannerTimeInputPattern);
  if (twelveHourMatch) {
    const hour = Number(twelveHourMatch[1]);
    const minute = Number(twelveHourMatch[2]);
    if (hour < 1 || hour > 12) {
      return null;
    }
    const isPm = twelveHourMatch[3].toUpperCase() === 'PM';
    return { hour: (hour % 12) + (isPm ? 12 : 0), minute };
  }

  const twentyFourHourMatch = normalized.match(timePattern);
  if (!twentyFourHourMatch) {
    return null;
  }

  const hour = Number(twentyFourHourMatch[1]);
  const minute = Number(twentyFourHourMatch[2]);
  return hour >= 0 && hour <= 23 ? { hour, minute } : null;
}

/** Formats a time as h:mm AM/PM for the share composer and share card. */
export function formatPlannerTimeInput(value: string | undefined | null) {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return '';
  }

  const parts = plannerTimeParts(normalized);
  if (!parts) {
    return normalized;
  }

  return `${parts.hour % 12 || 12}:${pad(parts.minute)} ${parts.hour >= 12 ? 'PM' : 'AM'}`;
}

/** Converts a share-composer time to the 24-hour value used by the domain. */
export function parsePlannerTimeInput(value: string | undefined | null) {
  const parts = plannerTimeParts(value);
  return parts ? `${pad(parts.hour)}:${pad(parts.minute)}` : null;
}

export function isValidDateString(value: string) {
  if (!datePattern.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isValidTimeString(value: string) {
  const match = value.trim().match(timePattern);
  if (!match) {
    return false;
  }

  const hour = Number(match[1]);
  return hour >= 0 && hour <= 23;
}

function localDateFromParts(dateString: string, timeString = '00:00') {
  const [year, month, day] = dateString.split('-').map(Number);
  const match = timeString.match(timePattern);
  const hour = match ? Number(match[1]) : 0;
  const minute = match ? Number(match[2]) : 0;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function isoDateFromLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function makeZonedDateTime(dateString: string, timeString: string, timeZone: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  const match = timeString.match(timePattern);
  const hour = match ? Number(match[1]) : 0;
  const minute = match ? Number(match[2]) : 0;
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  try {
    const getOffsetMilliseconds = (candidate: Date) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        second: '2-digit',
        timeZone,
        year: 'numeric',
      }).formatToParts(candidate);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const representedUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
        Number(values.second),
      );
      return representedUtc - candidate.getTime();
    };

    const firstGuess = new Date(naiveUtc);
    const firstOffset = getOffsetMilliseconds(firstGuess);
    const secondGuess = new Date(naiveUtc - firstOffset);
    const correctedOffset = getOffsetMilliseconds(secondGuess);
    return new Date(naiveUtc - correctedOffset).toISOString();
  } catch {
    // An invalid/missing IANA zone should not block calendar creation.
    return localDateFromParts(dateString, timeString).toISOString();
  }
}

function dateStringInTimeZone(value: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(value);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return getTodayDateString(value);
  }
}

export function normalizeTimeString(value: string) {
  const match = value.trim().match(timePattern);
  if (!match) {
    return value.trim();
  }
  return `${pad(Number(match[1]))}:${match[2]}`;
}

export function isOvernightSchedule(startTime: string, endTime: string) {
  if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) {
    return false;
  }
  return normalizeTimeString(endTime) <= normalizeTimeString(startTime);
}

export function datePartsFromDraft(draft: CalendarEventDraft): DateParts {
  const start = new Date(draft.startAt);
  if (Number.isNaN(start.getTime())) {
    return { date: '', time: '' };
  }

  const timeZone = draft.timeZone || getDeviceTimeZone();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(start);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      time: `${values.hour}:${values.minute}`,
    };
  } catch {
    // An invalid venue zone should not prevent a valid draft from being inspected.
  }

  return {
    date: getTodayDateString(start),
    time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
  };
}

export function buildCalendarDraftFromParts(options: {
  name: string;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  timeZone?: string;
  location?: string;
  notes?: string;
  weeklyRepeat?: boolean;
}) : CalendarEventDraft {
  const allDay = options.allDay === true;
  const timeZone = options.timeZone || getDeviceTimeZone();
  const startTime = normalizeTimeString(options.startTime ?? '00:00');
  const endTime = normalizeTimeString(options.endTime ?? '23:59');
  const overnight = !allDay && isOvernightSchedule(startTime, endTime);
  const endDate = allDay
    ? (() => {
      const next = localDateFromParts(options.date);
      next.setDate(next.getDate() + 1);
      return isoDateFromLocalDate(next);
    })()
    : overnight
      ? (() => {
        const next = localDateFromParts(options.date);
        next.setDate(next.getDate() + 1);
        return isoDateFromLocalDate(next);
      })()
      : options.date;

  return {
    allDay,
    endAt: makeZonedDateTime(endDate, allDay ? '00:00' : endTime, timeZone),
    location: options.location,
    notes: options.notes ?? '',
    startAt: makeZonedDateTime(options.date, allDay ? '00:00' : startTime, timeZone),
    timeZone,
    title: options.name,
    weeklyRepeat: options.weeklyRepeat ?? false,
  };
}

export function validateCalendarDraft(draft: {
  date: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
}) {
  if (!isValidDateString(draft.date)) {
    return 'Enter a valid date.';
  }
  if (draft.allDay) {
    return null;
  }
  if (!draft.startTime || !isValidTimeString(draft.startTime)) {
    return 'Enter a start time in 24-hour format, such as 15:00.';
  }
  if (!draft.endTime || !isValidTimeString(draft.endTime)) {
    return 'Enter an end time in 24-hour format, such as 18:00.';
  }
  if (normalizeTimeString(draft.startTime) === normalizeTimeString(draft.endTime)) {
    return 'Start and end times cannot be the same.';
  }
  return null;
}

function getWeekdayFromDate(date: Date, timeZone?: string) {
  if (timeZone) {
    try {
      const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
      }).format(date);
      const weekdayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
      if (weekdayIndex >= 0) {
        return weekdayIndex;
      }
    } catch {
      // Fall back to the device calendar below.
    }
  }

  // DiningDealz stores Monday as 0 and Sunday as 6.
  return (date.getDay() + 6) % 7;
}

function nextDateForWeekday(weekday: number, now = new Date(), timeZone?: string) {
  const currentDate = timeZone ? dateStringInTimeZone(now, timeZone) : getTodayDateString(now);
  const [year, month, day] = currentDate.split('-').map(Number);
  const currentWeekday = getWeekdayFromDate(now, timeZone);
  const offset = (weekday - currentWeekday + 7) % 7;
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + offset);
  return isoDateFromLocalDate(next);
}

function getTimeZoneFromPlace(place: PlaceDetail | PlaceLocationDetail | CurrentHappyHourPlace) {
  const candidate = place as unknown as { time_zone?: unknown; timezone?: unknown; iana_timezone?: unknown };
  return typeof candidate.time_zone === 'string' && candidate.time_zone.trim()
    ? candidate.time_zone.trim()
    : typeof candidate.timezone === 'string' && candidate.timezone.trim()
      ? candidate.timezone.trim()
      : typeof candidate.iana_timezone === 'string' && candidate.iana_timezone.trim()
        ? candidate.iana_timezone.trim()
        : getDeviceTimeZone();
}

function fullAddress(place: { address_line_1?: string; address_line_2?: string; city_label?: string; state?: string; postal_code?: string }) {
  return [
    place.address_line_1,
    place.address_line_2,
    place.city_label,
    place.state,
    place.postal_code,
  ].map((part) => part?.trim()).filter(Boolean).join(', ');
}

function scheduleFromHappyHour(window: HappyHourWindow | CurrentHappyHourWindow, deal?: Deal): PlannerSchedule {
  const hasWeekday = 'weekday' in window;
  const currentWindow = 'deal_id' in window ? window : null;
  const dealId = currentWindow?.deal_id ?? deal?.id;
  const title = currentWindow?.title ?? deal?.title ?? 'Happy Hour';
  const priceText = currentWindow?.price_text ?? deal?.price_text ?? '';
  return {
    allDay: window.all_day,
    dealId,
    dealTitle: deal?.title ?? currentWindow?.title,
    endTime: window.end_time,
    id: `happy-hour:${dealId ?? 'custom'}:${window.weekday_label}:${window.start_time}:${window.end_time}`,
    kind: 'happy-hour',
    label: [priceText, title].map((value) => value.trim()).filter(Boolean).join(' ') || 'Happy Hour',
    startTime: window.start_time,
    weekday: hasWeekday ? window.weekday : undefined,
    weekdayLabel: window.weekday_label,
  };
}

function scheduleFromOperatingHours(window: OperatingHourWindow): PlannerSchedule {
  return {
    allDay: window.open_24_hours === true,
    endTime: window.close_time,
    id: `operating-hours:${window.id}`,
    kind: 'operating-hours',
    label: window.open_24_hours ? 'Open 24 hours' : 'Hours of operation',
    startTime: window.open_time,
    weekday: window.weekday,
    weekdayLabel: window.weekday_label,
  };
}

export function getPlannerSchedules(context: PlannerPlaceContext, kind?: PlannerSchedule['kind']) {
  return kind ? context.schedules.filter((schedule) => schedule.kind === kind) : context.schedules;
}

export function getDefaultCalendarSelection(context: PlannerPlaceContext, selectedSchedule?: PlannerSchedule): {
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  scheduleId?: string;
} {
  const schedule = selectedSchedule
    ?? context.schedules.find((entry) => entry.kind === 'happy-hour')
    ?? context.schedules[0];

  if (!schedule) {
    return {
      allDay: false,
      date: dateStringInTimeZone(new Date(), context.timeZone),
      endTime: '',
      startTime: '',
    };
  }

  const date = schedule.weekday == null
    ? dateStringInTimeZone(new Date(), context.timeZone)
    : nextDateForWeekday(schedule.weekday, new Date(), context.timeZone);
  return {
    allDay: schedule.allDay,
    date,
    endTime: schedule.endTime,
    scheduleId: schedule.id,
    startTime: schedule.startTime,
  };
}

export function createPlannerContextFromPlace(
  place: PlaceDetail | PlaceLocationDetail,
  selectedDeal?: Deal,
  selectedSchedule?: HappyHourWindow,
): PlannerPlaceContext {
  const locations = 'locations' in place ? place.locations : [];
  const location = ('deals' in place && place.deals ? place : null) ?? locations[0] ?? place;
  const deals = 'deals' in location ? location.deals : [];
  const schedules: PlannerSchedule[] = deals.flatMap((deal) => (
    deal.happy_hours.map((window) => scheduleFromHappyHour(window, deal))
  ));
  const operatingHours = location.operating_hours ?? [];
  schedules.push(...operatingHours.map(scheduleFromOperatingHours));

  if (selectedDeal && selectedSchedule) {
    const selected = scheduleFromHappyHour(selectedSchedule, selectedDeal);
    const existingIndex = schedules.findIndex((schedule) => schedule.id === selected.id);
    if (existingIndex >= 0) {
      schedules.splice(existingIndex, 1, selected);
    } else {
      schedules.unshift(selected);
    }
  }

  return {
    address: fullAddress(location),
    cityLabel: location.city_label,
    deals: deals.map((deal) => ({
      dealTypeLabel: deal.deal_type_label,
      description: deal.description,
      happyHours: deal.happy_hours.map((window) => scheduleFromHappyHour(window, deal)),
      id: deal.id,
      imageUrl: deal.attachment?.content_type?.startsWith('image/') ? deal.attachment.url : undefined,
      menuText: [deal.price_text, deal.description, deal.terms].filter(Boolean).join('\n'),
      priceText: deal.price_text,
      terms: deal.terms,
      title: deal.title,
    })),
    imageUrls: Array.from(new Set([
      ...(location.image_urls ?? []),
      ...(place.image_urls ?? []),
      ...deals.map((deal) => deal.attachment?.content_type?.startsWith('image/') ? deal.attachment.url : '').filter(Boolean),
    ])),
    latitude: location.latitude,
    longitude: location.longitude,
    name: place.name,
    reference: {
      dealId: selectedDeal?.id,
      happyHourWindowId: selectedSchedule?.id,
      locationId: location.id,
      slug: place.slug,
    },
    schedules,
    timeZone: getTimeZoneFromPlace(location),
    venueTypeLabel: location.venue_type_label,
  };
}

export function createPlannerContextFromCurrentPlace(
  place: CurrentHappyHourPlace,
  selectedSchedule?: CurrentHappyHourWindow,
): PlannerPlaceContext {
  const scheduleWindows = place.happy_hours.map((window) => scheduleFromHappyHour(window));
  const selected = selectedSchedule ? scheduleFromHappyHour(selectedSchedule) : undefined;
  const schedules = selected
    ? [selected, ...scheduleWindows.filter((entry) => entry.id !== selected.id)]
    : scheduleWindows;

  return {
    address: fullAddress({
      address_line_1: place.address_line_1,
      address_line_2: place.address_line_2,
      city_label: place.city_label,
    }),
    cityLabel: place.city_label,
    deals: [],
    imageUrls: place.image_urls ?? [],
    latitude: place.latitude,
    longitude: place.longitude,
    name: place.name,
    reference: {
      dealId: selectedSchedule?.deal_id ?? undefined,
      happyHourWindowId: undefined,
      locationId: place.location_id,
      slug: place.slug,
    },
    schedules,
    timeZone: getTimeZoneFromPlace(place),
    venueTypeLabel: place.venue_type_label,
  };
}

export function buildCalendarNotes(context: PlannerPlaceContext, schedule?: PlannerSchedule) {
  const counts = getPlannerContentCounts(context);
  const operatingHours = formatPlannerOperatingHours(context);
  const titles = getPlannerContentTitles(context);
  const lines = [
    'DiningDealz',
    counts.happyHourSpecials ? formatPlannerContentSummary('Happy Hours and Deals', counts.happyHourSpecials, 'special', titles.happyHourTitles) : '',
    operatingHours ? `Hours of operation: ${operatingHours}` : '',
    context.deals.length ? formatPlannerContentSummary('Specials and Menu', context.deals.length, 'deal', titles.dealTitles) : '',
    context.address ? `Location: ${context.address}` : '',
    buildMapUrl(context) ? `Map: ${buildMapUrl(context)}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export function getPlannerContentCounts(context: PlannerPlaceContext) {
  const happyHourSchedules = context.schedules.filter((schedule) => schedule.kind === 'happy-hour');
  const happyHourDealIds = new Set(happyHourSchedules.flatMap((schedule) => schedule.dealId == null ? [] : [schedule.dealId]));
  const happyHourSchedulesWithoutDeal = happyHourSchedules.filter((schedule) => schedule.dealId == null).length;

  return {
    happyHourSpecials: happyHourDealIds.size + happyHourSchedulesWithoutDeal,
    operatingHourSchedules: context.schedules.filter((schedule) => schedule.kind === 'operating-hours').length,
  };
}

export function formatPlannerCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatPlannerContentSummary(label: string, count: number, singular: string, titles: string[] = []) {
  const titleSuffix = titles.length ? ` — ${titles.join(', ')}` : '';
  return `${label}: ${formatPlannerCount(count, singular)}${titleSuffix}`;
}

function uniquePlannerTitles(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values
    .map((value) => value?.trim() ?? '')
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
}

export function getPlannerContentTitles(context: PlannerPlaceContext): PlannerContentTitles {
  const happyHourSchedules = [
    ...context.schedules.filter((schedule) => schedule.kind === 'happy-hour'),
    ...context.deals.flatMap((deal) => deal.happyHours),
  ];

  return {
    dealTitles: uniquePlannerTitles(context.deals.map((deal) => deal.title)),
    happyHourTitles: uniquePlannerTitles(happyHourSchedules.map((schedule) => {
      const title = schedule.dealTitle?.trim();
      if (title) {
        return title;
      }
      const fallback = schedule.label.trim();
      return fallback && fallback.toLowerCase() !== 'happy hour' ? fallback : undefined;
    })),
  };
}

export function formatPlannerOperatingHours(context: PlannerPlaceContext) {
  return context.schedules
    .filter((schedule) => schedule.kind === 'operating-hours')
    .map((schedule) => {
      const day = schedule.weekdayLabel ? `${schedule.weekdayLabel}: ` : '';
      if (schedule.allDay) {
        return `${day}Open 24 hours`;
      }
      const start = formatPlannerTimeInput(schedule.startTime);
      const end = formatPlannerTimeInput(schedule.endTime);
      const range = [start, end].filter(Boolean).join(' - ');
      return `${day}${range || schedule.label}`;
    })
    .filter(Boolean)
    .join('; ');
}

export function getBusinessProfileLinks(context: Pick<PlannerPlaceContext, 'reference'>): BusinessProfileLinks | null {
  const slug = context.reference.slug.trim();
  if (!slug || (!diningDealzIOSAppStoreURL && !diningDealzAndroidStoreURL)) {
    return null;
  }

  const encodedSlug = encodeURIComponent(slug);
  return {
    androidStore: diningDealzAndroidStoreURL || undefined,
    app: diningDealzAndroidStoreURL ? `diningdealz://place/${encodedSlug}` : undefined,
    iosProfile: diningDealzIOSAppStoreURL
      ? `${getDiningDealzIOSProfileLinkBaseURL()}/${encodedSlug}/`
      : undefined,
    iosStore: diningDealzIOSAppStoreURL || undefined,
  };
}

export function getPlannerShareCardDetails(context: PlannerPlaceContext, selection: RestaurantShareSelection) {
  const lines: string[] = [];

  if (selection.mode === 'my-time') {
    const date = selection.date ? formatPlannerDateInput(selection.date) : '';
    const start = selection.startTime ? formatPlannerTimeInput(selection.startTime) : '';
    const end = selection.endTime ? formatPlannerTimeInput(selection.endTime) : '';
    const timeRange = start && end ? `${start} - ${end}` : start || end;
    if (date || timeRange) {
      lines.push(`My time: ${[date, timeRange].filter(Boolean).join(' · ')}`);
    }
  }

  const counts = getPlannerContentCounts(context);
  const titles = getPlannerContentTitles(context);
  const operatingHours = formatPlannerOperatingHours(context);
  const selectedDeals = context.deals.filter((deal) => selection.selectedDealIds.includes(deal.id));

  if (selection.includeHappyHours && counts.happyHourSpecials) {
    lines.push(formatPlannerContentSummary('Happy Hours and Deals', counts.happyHourSpecials, 'special', titles.happyHourTitles));
  }
  if (selection.includeOperatingHours && operatingHours) {
    lines.push(`Hours of operation: ${operatingHours}`);
  }
  if (selection.includeDealsAndMenu && selectedDeals.length) {
    lines.push(formatPlannerContentSummary(
      'Specials and Menu',
      selectedDeals.length,
      'deal',
      uniquePlannerTitles(selectedDeals.map((deal) => deal.title)),
    ));
  }
  if (selection.includeLocation && context.address) {
    lines.push(context.address);
  }

  return lines;
}

export function buildMapUrl(context: Pick<PlannerPlaceContext, 'latitude' | 'longitude' | 'address' | 'name'>) {
  if (context.latitude != null && context.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${context.latitude},${context.longitude}`)}`;
  }
  if (context.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${context.name}, ${context.address}`)}`;
  }
  return '';
}

export function buildShareText(
  context: PlannerPlaceContext,
  _selection: RestaurantShareSelection,
  options: { includeProfileLink?: boolean; profileLink?: string } = {},
) {
  const lines = [`Check out ${context.name} on DiningDealz`];
  const profileLinks = getBusinessProfileLinks(context);
  const profileLink = options.profileLink ?? profileLinks?.iosProfile ?? profileLinks?.app;
  if (profileLink && options.includeProfileLink !== false) {
    lines.push(profileLink);
  }

  return lines.filter(Boolean).join('\n');
}

export function getDefaultShareSelection(context: PlannerPlaceContext, mode: RestaurantShareSelection['mode'] = 'restaurant-details'): RestaurantShareSelection {
  return {
    date: dateStringInTimeZone(new Date(), context.timeZone),
    endTime: '',
    includeDealsAndMenu: mode === 'restaurant-details',
    includeHappyHours: mode === 'restaurant-details' && context.schedules.some((schedule) => schedule.kind === 'happy-hour'),
    includeLocation: true,
    includeOperatingHours: mode === 'restaurant-details' && context.schedules.some((schedule) => schedule.kind === 'operating-hours'),
    includePhotos: mode === 'restaurant-details' && context.imageUrls.length > 0,
    mode,
    selectedDealIds: context.deals.map((deal) => deal.id),
    selectedPhotoUri: context.imageUrls[0],
    startTime: '',
  };
}

function escapeIcsText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function formatIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildIcsContent(draft: CalendarEventDraft) {
  const uid = `diningdealz-${Date.now()}@diningdealz`;
  const start = new Date(draft.startAt);
  const end = new Date(draft.endAt);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DiningDealz//External Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART${draft.allDay ? ';VALUE=DATE' : ''}:${draft.allDay ? dateStringInTimeZone(start, draft.timeZone).replace(/-/g, '') : formatIcsDate(start)}`,
    `DTEND${draft.allDay ? ';VALUE=DATE' : ''}:${draft.allDay ? dateStringInTimeZone(end, draft.timeZone).replace(/-/g, '') : formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(draft.title)}`,
    draft.location ? `LOCATION:${escapeIcsText(draft.location)}` : '',
    draft.notes ? `DESCRIPTION:${escapeIcsText(draft.notes)}` : '',
    draft.timeZone ? `X-WR-TIMEZONE:${escapeIcsText(draft.timeZone)}` : '',
    draft.weeklyRepeat ? 'RRULE:FREQ=WEEKLY' : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.filter(Boolean).join('\r\n')}\r\n`;
}
