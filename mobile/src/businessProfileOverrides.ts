import type {
  BusinessDealHappyHourOverride,
  BusinessDealOverride,
  BusinessOperatingHourOverride,
  Deal,
  HappyHourWindow,
  OperatingHourWindow,
} from './types';

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const businessWeekdayOptions = weekdayLabels.map((label, weekday) => ({
  label,
  weekday,
}));

  export function createEmptyOperatingHourOverride(): BusinessOperatingHourOverride {
    return {
      id: createId('hours'),
      group_id: createId('hours-group'),
      weekdays: [0],
      weekday: 0,
      open_time: '11:00 AM',
      close_time: '10:00 PM',
      open_24_hours: false,
    };
  }

  export function createEmptyHappyHourOverride(): BusinessDealHappyHourOverride {
    return {
      id: createId('happy-hour'),
      weekdays: [0],
      weekday: 0,
      start_time: '3:00 PM',
      end_time: '6:00 PM',
      all_day: false,
    };
  }

  export function createEmptyDealOverride(): BusinessDealOverride {
    return {
      id: createId('deal'),
      title: '',
      description: '',
      deal_type: 'happy_hour',
      custom_deal_type_label: '',
      price_text: '',
      terms: '',
      happy_hours: [createEmptyHappyHourOverride()],
    };
  }

  export function buildOperatingHourOverridesFromWindows(windows: OperatingHourWindow[]): BusinessOperatingHourOverride[] {
    return groupOperatingHourOverrides(windows).map((window, index) => ({
      id: createId('hours'),
      group_id: window.group_id,
      group_rank: window.group_rank ?? index,
      weekdays: window.weekdays,
      weekday: window.weekdays[0] ?? 0,
      open_time: window.open_time,
      close_time: window.close_time,
      open_24_hours: Boolean(window.open_24_hours),
    }));
  }

  export function buildDealOverridesFromDeals(deals: Deal[]): BusinessDealOverride[] {
    return deals.map((deal) => ({
      id: createId('deal'),
      title: deal.title,
      description: deal.description,
      deal_type: deal.deal_type,
      custom_deal_type_label: deal.custom_deal_type_label ?? (deal.deal_type === 'other' ? deal.deal_type_label : ''),
      price_text: deal.price_text,
      terms: deal.terms,
      happy_hours: deal.happy_hours.length
        ? groupHappyHourOverrides(deal.happy_hours).map((window) => ({
          id: createId('happy-hour'),
          weekdays: window.weekdays,
          weekday: window.weekdays[0] ?? 0,
          start_time: window.start_time,
          end_time: window.end_time,
          all_day: window.all_day,
        }))
        : [createEmptyHappyHourOverride()],
    }));
  }

  export function buildNormalizedOperatingHourOverrides(overrides: BusinessOperatingHourOverride[]) {
    return overrides
      .flatMap((override, index) => expandOperatingHourOverride(override)
        .map((expandedOverride) => ({
          weekday: expandedOverride.weekday,
          open_time: expandedOverride.open_24_hours ? '00:00' : expandedOverride.open_time.trim(),
          close_time: expandedOverride.open_24_hours ? '23:59' : expandedOverride.close_time.trim(),
          open_24_hours: expandedOverride.open_24_hours,
          group_id: override.group_id || override.id || `hours-group-${index}`,
          group_rank: override.group_rank ?? index,
        })))
      .filter((override) => override.open_24_hours || (override.open_time && override.close_time))
      .sort((left, right) => (left.group_rank ?? Number.MAX_SAFE_INTEGER) - (right.group_rank ?? Number.MAX_SAFE_INTEGER) || left.weekday - right.weekday || left.open_time.localeCompare(right.open_time));
  }

  function getOperatingHourOverrideWeekdays(window: BusinessOperatingHourOverride | OperatingHourWindow) {
    const rawWeekdays = 'weekdays' in window && Array.isArray(window.weekdays) && window.weekdays.length
      ? window.weekdays
      : [window.weekday];
    return Array.from(new Set(rawWeekdays.map((weekday) => Number(weekday)).filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6))).sort((left, right) => left - right);
  }

  function groupOperatingHourOverrides(operatingHours: OperatingHourWindow[]) {
    const groups = new Map<string, { close_time: string; group_id: string; group_rank: number | null; open_24_hours: boolean; open_time: string; weekdays: number[] }>();
    operatingHours.forEach((window, index) => {
      const key = window.group_id ? `group:${window.group_id}` : `${window.open_24_hours ? '24hr' : 'timed'}|${window.open_time}|${window.close_time}`;
      const current = groups.get(key);
      if (current) {
        current.weekdays.push(window.weekday);
        current.weekdays = Array.from(new Set(current.weekdays)).sort((left, right) => left - right);
        return;
      }
      groups.set(key, {
        group_id: window.group_id || `derived-hours-group-${index}`,
        group_rank: window.group_rank ?? index,
        weekdays: [window.weekday],
        open_time: window.open_24_hours ? '12:00 AM' : formatTime(window.open_time),
        close_time: window.open_24_hours ? '11:59 PM' : formatTime(window.close_time),
        open_24_hours: Boolean(window.open_24_hours),
      });
    });
    return Array.from(groups.values()).sort((left, right) => (left.group_rank ?? Number.MAX_SAFE_INTEGER) - (right.group_rank ?? Number.MAX_SAFE_INTEGER));
  }

  function expandOperatingHourOverride(window: BusinessOperatingHourOverride) {
    const weekdays = getOperatingHourOverrideWeekdays(window);
    return weekdays.map((weekday) => ({
      weekday,
      open_time: window.open_time,
      close_time: window.close_time,
      open_24_hours: Boolean(window.open_24_hours),
    }));
  }

  export function buildNormalizedDealOverrides(overrides: BusinessDealOverride[]) {
    return overrides
      .map((override) => ({
        title: override.title.trim(),
        description: override.description.trim(),
        deal_type: override.deal_type.trim() || 'happy_hour',
        custom_deal_type_label: override.deal_type.trim() === 'other' ? (override.custom_deal_type_label ?? '').trim() : '',
        price_text: override.price_text.trim(),
        terms: override.terms.trim(),
        happy_hours: override.happy_hours
          .flatMap((window) => expandHappyHourOverride(window)
            .map((expandedWindow) => ({
              weekday: expandedWindow.weekday,
              start_time: expandedWindow.start_time.trim(),
              end_time: expandedWindow.end_time.trim(),
              all_day: expandedWindow.all_day,
            })))
          .filter((window) => window.all_day || (window.start_time && window.end_time))
          .sort((left, right) => left.weekday - right.weekday || left.start_time.localeCompare(right.start_time)),
      }))
      .filter((override) => override.title || override.description || override.price_text || override.terms || override.happy_hours.length);
  }

  function getHappyHourOverrideWeekdays(window: BusinessDealHappyHourOverride | HappyHourWindow) {
    const rawWeekdays = 'weekdays' in window && Array.isArray(window.weekdays) && window.weekdays.length
      ? window.weekdays
      : [window.weekday];
    return Array.from(new Set(rawWeekdays.map((weekday) => Number(weekday)).filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6))).sort((left, right) => left - right);
  }

  function groupHappyHourOverrides(happyHours: HappyHourWindow[]) {
    const groups = new Map<string, { all_day: boolean; end_time: string; start_time: string; weekdays: number[] }>();
    happyHours.forEach((window) => {
      const key = `${window.all_day ? 'all-day' : 'timed'}|${window.start_time}|${window.end_time}`;
      const current = groups.get(key);
      if (current) {
        current.weekdays.push(window.weekday);
        current.weekdays = Array.from(new Set(current.weekdays)).sort((left, right) => left - right);
        return;
      }
      groups.set(key, {
        weekdays: [window.weekday],
        start_time: window.all_day ? '12:00 AM' : formatTime(window.start_time),
        end_time: window.all_day ? '11:59 PM' : formatTime(window.end_time),
        all_day: window.all_day,
      });
    });
    return Array.from(groups.values());
  }

  function expandHappyHourOverride(window: BusinessDealHappyHourOverride) {
    const weekdays = getHappyHourOverrideWeekdays(window);
    return weekdays.map((weekday) => ({
      weekday,
      start_time: window.start_time,
      end_time: window.end_time,
      all_day: window.all_day,
    }));
  }

  export function formatTime(value: string) {
    const normalized = value.trim();
    const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      const hour = Number.parseInt(match24[1], 10);
      const suffix = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      return `${hour12}:${match24[2]} ${suffix}`;
    }

    const match12 = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (match12) {
      return `${Number.parseInt(match12[1], 10)}:${match12[2] ?? '00'} ${match12[3].toUpperCase()}`;
    }

    return normalized;
  }

  export function formatWeekdayRanges(weekdayValues: number[]) {
    const orderedDays = Array.from(new Set(weekdayValues)).sort((left, right) => left - right);
    if (!orderedDays.length) {
      return '';
    }

    const segments: string[] = [];
    let rangeStart = orderedDays[0];
    let previousDay = orderedDays[0];
    for (let index = 1; index < orderedDays.length; index += 1) {
      const currentDay = orderedDays[index];
      if (currentDay === previousDay + 1) {
        previousDay = currentDay;
        continue;
      }
      segments.push(formatWeekdaySegment(rangeStart, previousDay));
      rangeStart = currentDay;
      previousDay = currentDay;
    }
    segments.push(formatWeekdaySegment(rangeStart, previousDay));
    return segments.join(', ');
  }

  function formatWeekdaySegment(startDay: number, endDay: number) {
    if (startDay === endDay) {
      return weekdayLabels[startDay].toUpperCase();
    }
    return `${weekdayLabels[startDay].toUpperCase()}-${weekdayLabels[endDay].toUpperCase()}`;
  }

  export function formatOperatingHourGroups(operatingHours: BusinessOperatingHourOverride[] | OperatingHourWindow[]) {
    return operatingHours.map((operatingHour, index) => ({
      id: ('group_id' in operatingHour && operatingHour.group_id) ? operatingHour.group_id : `hours-row-${index}`,
      dayLabel: formatWeekdayRanges(getOperatingHourOverrideWeekdays(operatingHour)),
      timeLabel: operatingHour.open_24_hours ? 'Open 24 hours' : `${formatTime(operatingHour.open_time)} - ${formatTime(operatingHour.close_time)}`,
    }));
  }

  export function formatHappyHourGroups(happyHours: BusinessDealHappyHourOverride[] | HappyHourWindow[], operatingHours: Array<BusinessOperatingHourOverride | OperatingHourWindow> = []) {
    const groups = new Map<string, Array<BusinessDealHappyHourOverride | HappyHourWindow>>();
    happyHours.forEach((happyHour) => {
      const key = happyHour.all_day ? 'all-day' : `${happyHour.start_time}-${happyHour.end_time}`;
      const currentGroup = groups.get(key) ?? [];
      currentGroup.push(happyHour);
      groups.set(key, currentGroup);
    });

    return Array.from(groups.values()).map((group, index) => {
      const weekdays = group.flatMap((happyHour) => getHappyHourOverrideWeekdays(happyHour));
      const endLabel = isCloseLabel(group[0].end_time, weekdays, operatingHours)
        ? 'Close'
        : formatTime(group[0].end_time);
      return {
        id: `happy-hour-group-${index}`,
        dayLabel: formatWeekdayRanges(weekdays),
        timeLabel: group[0].all_day ? 'All day' : `${formatTime(group[0].start_time)} - ${endLabel}`,
      };
    });
  }

  function isCloseLabel(endTime: string, weekdays: number[], operatingHours: Array<BusinessOperatingHourOverride | OperatingHourWindow>) {
    if (!operatingHours.length) {
      return false;
    }

    const closeTimesByWeekday = new Map<number, string>();
    operatingHours.forEach((operatingHour) => {
      getOperatingHourOverrideWeekdays(operatingHour).forEach((weekday) => {
        closeTimesByWeekday.set(weekday, operatingHour.open_24_hours ? '23:59' : operatingHour.close_time);
      });
    });
    return weekdays.every((weekday) => closeTimesByWeekday.get(weekday) === endTime);
  }