import { buildEditableDealOverrides, buildNormalizedDealOverrides, formatMenuItemWeekdays } from '../businessProfileOverrides';
import type { BusinessDealOverride } from '../types';

const deal: BusinessDealOverride = {
  title: 'Happy Hour',
  description: 'Sample deal description',
  deal_type: 'happy_hour',
  price_text: '',
  terms: '',
  happy_hours: [],
};

describe('business deal override normalization', () => {
  it('preserves an explicitly entered description price in the owner payload', () => {
    expect(buildNormalizedDealOverrides([{ ...deal, description_price: '$2' }])[0]).toHaveProperty('description_price', '$2');
  });

  it('keeps the legacy payload shape when no description price was entered', () => {
    expect(buildNormalizedDealOverrides([deal])[0]).not.toHaveProperty('description_price');
  });

  it('saves explicit item weekdays and preserves them when reopening the editor', () => {
    const menuItems = [
      { name: 'Tani combo', price: '$15.98', detail: 'Fish tacos and a drink', weekdays: [2, 1, 2] },
      { name: 'House wine', price: '$8', detail: '' },
      { name: 'Chips', price: '$4', detail: '', weekdays: [] },
    ];
    const normalized = buildNormalizedDealOverrides([{ ...deal, menu_items: menuItems }])[0];
    expect(normalized.menu_items).toEqual([
      { ...menuItems[0], weekdays: [1, 2] }, menuItems[1], { name: 'Chips', price: '$4', detail: '' },
    ]);
    expect(buildEditableDealOverrides([{ ...deal, menu_items: normalized.menu_items }])[0].menu_items?.[0]).toMatchObject({ weekdays: [1, 2], price: '$15.98' });
    expect(menuItems[0].weekdays).toEqual([2, 1, 2]);
  });

  it('labels only selected days without inventing a default weekday', () => {
    expect(formatMenuItemWeekdays()).toBe('');
    expect(formatMenuItemWeekdays([])).toBe('');
    expect(formatMenuItemWeekdays([1])).toBe('Tuesday');
    expect(formatMenuItemWeekdays([5, 2, 2])).toBe('Wed, Sat');
  });
});
