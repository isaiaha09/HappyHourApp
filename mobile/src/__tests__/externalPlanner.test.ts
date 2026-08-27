import {
  buildCalendarDraftFromParts,
  buildIcsContent,
  buildMapUrl,
  buildShareText,
  createPlannerContextFromCurrentPlace,
  formatPlannerDateInput,
  formatPlannerTimeInput,
  getDefaultCalendarSelection,
  parsePlannerDateInput,
  parsePlannerTimeInput,
  validateCalendarDraft,
} from '../externalPlanner';
import type { CurrentHappyHourPlace } from '../types';

const place: CurrentHappyHourPlace = {
  address_line_1: '123 Main Street',
  address_line_2: '',
  city: 'ventura',
  city_label: 'Ventura',
  happy_hours: [{
    all_day: false,
    deal_id: 12,
    end_time: '18:00',
    price_text: '$5 wells',
    start_time: '15:00',
    title: 'Afternoon Happy Hour',
    weekday_label: 'Wednesday',
  }],
  image_urls: [],
  latitude: 34.28,
  location_id: 7,
  longitude: -119.29,
  name: 'Example Bar',
  slug: 'example-bar',
  venue_type_label: 'Bar',
};

describe('external planner domain', () => {
  it('prefills a current happy-hour schedule and keeps the restaurant identity', () => {
    const context = createPlannerContextFromCurrentPlace(place);
    const selection = getDefaultCalendarSelection(context);

    expect(selection.startTime).toBe('15:00');
    expect(selection.endTime).toBe('18:00');
    expect(selection.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(context.reference).toMatchObject({ locationId: 7, slug: 'example-bar' });
  });

  it('places overnight calendar endings on the following date', () => {
    const draft = buildCalendarDraftFromParts({
      date: '2026-08-27',
      endTime: '01:00',
      name: 'Late Night Bar',
      startTime: '22:00',
      timeZone: 'America/Los_Angeles',
    });

    expect(new Date(draft.endAt).getTime()).toBeGreaterThan(new Date(draft.startAt).getTime());
    expect(new Date(draft.endAt).getDate()).not.toBe(new Date(draft.startAt).getDate());
  });

  it('creates an all-day event with a one-day exclusive end', () => {
    const draft = buildCalendarDraftFromParts({
      allDay: true,
      date: '2026-08-27',
      name: 'Cafe Visit',
    });

    expect(draft.allDay).toBe(true);
    expect(new Date(draft.endAt).getTime() - new Date(draft.startAt).getTime()).toBe(86_400_000);
  });

  it('rejects missing custom times and equal times', () => {
    expect(validateCalendarDraft({ date: '2026-08-27' })).toContain('start time');
    expect(validateCalendarDraft({ date: '2026-08-27', endTime: '15:00', startTime: '15:00' })).toContain('same');
  });

  it('includes the selected restaurant, map link, and readable details in sharing', () => {
    const context = createPlannerContextFromCurrentPlace(place);
    const text = buildShareText(context, {
      date: '2026-08-27',
      endTime: '18:00',
      includeDealsAndMenu: false,
      includeHappyHours: true,
      includeLocation: true,
      includeOperatingHours: false,
      includePhotos: false,
      mode: 'my-time',
      selectedDealIds: [],
      startTime: '16:30',
    });

    expect(text).toContain('Example Bar');
    expect(text).toContain('DiningDealz restaurant recommendation');
    expect(text).toContain('08-27-2026');
    expect(text).toContain('4:30 PM - 6:00 PM');
    expect(text).toContain(`DiningDealz map: ${buildMapUrl(context)}`);
    expect(text).toContain('Shared from the DiningDealz app');
  });

  it('keeps share date and time fields in the display format while normalizing them for the domain', () => {
    expect(formatPlannerDateInput('2026-08-27')).toBe('08-27-2026');
    expect(parsePlannerDateInput('08-27-2026')).toBe('2026-08-27');
    expect(formatPlannerTimeInput('15:00')).toBe('3:00 PM');
    expect(parsePlannerTimeInput('3:00 PM')).toBe('15:00');
    expect(parsePlannerTimeInput('15:00')).toBe('15:00');
  });

  it('generates an external-calendar .ics fallback without reading calendars', () => {
    const draft = buildCalendarDraftFromParts({
      date: '2026-08-27',
      endTime: '18:00',
      location: '123 Main Street, Ventura',
      name: 'Example Bar',
      notes: 'DiningDealz',
      startTime: '15:00',
      timeZone: 'America/Los_Angeles',
      weeklyRepeat: true,
    });
    const ics = buildIcsContent(draft);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Example Bar');
    expect(ics).toContain('LOCATION:123 Main Street\\, Ventura');
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
    expect(ics).toContain('END:VCALENDAR');
  });
});
