import {
  buildCalendarNotes,
  buildCalendarDraftFromParts,
  buildIcsContent,
  buildShareText,
  createPlannerContextFromCurrentPlace,
  formatPlannerDateInput,
  getBusinessProfileLinks,
  formatPlannerOperatingHours,
  formatPlannerTimeInput,
  getDefaultCalendarSelection,
  getPlannerShareCardDetails,
  parsePlannerDateInput,
  parsePlannerTimeInput,
  validateCalendarDraft,
} from '../externalPlanner';
import type { RestaurantShareSelection } from '../externalPlanner';
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

  it('keeps the share message short and puts selected details in the card', () => {
    const context = createPlannerContextFromCurrentPlace(place);
    const selection = {
      date: '2026-08-27',
      endTime: '18:00',
      includeDealsAndMenu: false,
      includeHappyHours: true,
      includeLocation: true,
      includeOperatingHours: false,
      includePhotos: false,
      mode: 'my-time' as const,
      selectedDealIds: [],
      startTime: '16:30',
    };
    const text = buildShareText(context, selection);
    const cardDetails = getPlannerShareCardDetails(context, selection);
    const profileLinks = getBusinessProfileLinks(context);

    expect(text).toBe(`Check out Example Bar on DiningDealz\n${profileLinks?.app}`);
    expect(profileLinks?.iosProfile).toBe('https://backend.diningdealz.com/share/place/example-bar/');
    expect(cardDetails).toContain('My time: 08-27-2026 · 4:30 PM - 6:00 PM');
    expect(cardDetails).toContain('Happy Hours and Deals: 1 special — Afternoon Happy Hour');
    expect(cardDetails).toContain('123 Main Street, Ventura');
    expect(text).not.toContain('Afternoon Happy Hour');
  });

  it('shares deal counts while retaining operating-hour times', () => {
    const context = createPlannerContextFromCurrentPlace(place);
    context.schedules.push({
      allDay: false,
      endTime: '14:00',
      id: 'operating-hours:1',
      kind: 'operating-hours',
      label: 'Hours of operation',
      startTime: '11:30',
      weekdayLabel: 'MON-SUN',
    });
    const selection: RestaurantShareSelection = {
      includeDealsAndMenu: false,
      includeHappyHours: true,
      includeLocation: false,
      includeOperatingHours: true,
      includePhotos: false,
      mode: 'restaurant-details',
      selectedDealIds: [],
    };
    const text = buildShareText(context, selection);
    const cardDetails = getPlannerShareCardDetails(context, selection);
    const notes = buildCalendarNotes(context);

    expect(formatPlannerOperatingHours(context)).toBe('MON-SUN: 11:30 AM - 2:00 PM');
    expect(cardDetails).toContain('Hours of operation: MON-SUN: 11:30 AM - 2:00 PM');
    expect(text).toBe(`Check out Example Bar on DiningDealz\n${getBusinessProfileLinks(context)?.app}`);
    expect(text).not.toContain('Hours of operation');
    expect(text).not.toContain('Afternoon Happy Hour');
    expect(notes).toContain('Happy Hours and Deals: 1 special — Afternoon Happy Hour');
    expect(notes).toContain('Hours of operation: MON-SUN: 11:30 AM - 2:00 PM');
  });

  it('puts available deal titles in the card without adding extra links to the message', () => {
    const context = createPlannerContextFromCurrentPlace(place);
    context.deals.push({
      dealTypeLabel: 'Special',
      description: 'A lunch offer',
      happyHours: [],
      id: 44,
      menuText: 'Lunch offer',
      priceText: '$8',
      terms: '',
      title: 'Lunch Special',
    });
    const selection: RestaurantShareSelection = {
      includeDealsAndMenu: true,
      includeHappyHours: true,
      includeLocation: false,
      includeOperatingHours: false,
      includePhotos: false,
      mode: 'restaurant-details',
      selectedDealIds: [44],
    };
    const text = buildShareText(context, selection);
    const cardDetails = getPlannerShareCardDetails(context, selection);

    expect(cardDetails).toContain('Happy Hours and Deals: 1 special — Afternoon Happy Hour');
    expect(cardDetails).toContain('Specials and Menu: 1 deal — Lunch Special');
    expect(text).not.toContain('https://');
    expect(text).not.toContain('Download DiningDealz');
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
