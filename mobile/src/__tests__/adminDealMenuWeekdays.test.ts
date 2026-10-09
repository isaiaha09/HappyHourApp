/** @jest-environment jsdom */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const editorSource = readFileSync(resolve(__dirname, '../../../backend/places/static/places/admin/listingsnapshot_structured_overrides.js'), 'utf8');
const ordinaryItem = { name: 'House wine', price: '$8', detail: 'Red or white' };
const dailyItem = { name: 'Tani combo', price: '$15.98', detail: 'Fish tacos', weekdays: [1] };

function loadEditor(items: unknown[], seeded = false) {
  document.body.innerHTML = '';
  jest.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  const textarea = document.createElement('textarea');
  textarea.name = 'deal_overrides';
  textarea.dataset.structuredEditor = 'deals';
  const deals = JSON.stringify([{ title: 'Special combos', description: '', deal_type: 'daily_special', price_text: '', terms: '', menu_items: items, happy_hours: [] }]);
  if (seeded) {
    textarea.dataset.initialJson = deals;
    textarea.dataset.initialSource = 'current-public';
  } else {
    textarea.value = deals;
  }
  document.body.append(textarea);
  window.eval(editorSource);
  return textarea;
}

function click(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find((element) => element.getAttribute('aria-label') === label);
  expect(button).toBeDefined();
  button!.click();
}

describe('shared claimed and unclaimed admin menu-item editor', () => {
  afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; });

  it.each([false, true])('hydrates and saves weekday labels while preserving normal items (public seed = %s)', (seeded) => {
    const textarea = loadEditor([ordinaryItem, dailyItem], seeded);
    const row = document.querySelector('.structured-admin-editor__preview-weekday-row')!;
    expect(row.querySelector('.structured-admin-editor__preview-weekday-label')?.textContent).toBe('Tuesday');
    expect(row.querySelector('.structured-admin-editor__preview-copy')?.textContent).toBe('Tani combo $15.98 (Fish tacos)');
    expect(row.querySelector('.structured-admin-editor__preview-menu-price')).toBeNull();
    expect(document.querySelectorAll('.structured-admin-editor__preview-menu-item')).toHaveLength(1);
    const dayButton = 'Deal 1 menu item 2 Wed';
    click(dayButton);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(dayButton);
    expect(JSON.parse(textarea.value)[0].menu_items).toEqual([ordinaryItem, { ...dailyItem, weekdays: [1, 2] }]);
    expect(document.querySelector('.structured-admin-editor__preview-weekday-label')?.textContent).toBe('Tue, Wed');
    expect((document.querySelector('input[name="deal_overrides_touched"]') as HTMLInputElement).value).toBe('1');
  });

  it('switches between weekday and price columns without discarding price, details, or remembered days', () => {
    const textarea = loadEditor([dailyItem]);
    click('Deal 1 menu item 1 price column');
    expect(document.querySelector('.structured-admin-editor__preview-weekday-row')).toBeNull();
    expect(document.querySelector('.structured-admin-editor__preview-menu-price')?.textContent).toBe('$15.98');
    expect(JSON.parse(textarea.value)[0].menu_items[0]).toEqual({ name: dailyItem.name, price: dailyItem.price, detail: dailyItem.detail });
    click('Deal 1 menu item 1 price column');
    click('Deal 1 menu item 1 weekday label');
    expect(JSON.parse(textarea.value)[0].menu_items[0]).toEqual(dailyItem);
    expect(document.querySelector('.structured-admin-editor__preview-menu-price')).toBeNull();

    const saved = JSON.parse(textarea.value)[0].menu_items;
    loadEditor(saved);
    expect(document.querySelector('.structured-admin-editor__preview-weekday-label')?.textContent).toBe('Tuesday');
    expect(document.querySelector('[aria-label="Deal 1 menu item 1 Tue"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('does not invent a weekday or replace focused inputs while typing', () => {
    const textarea = loadEditor([ordinaryItem]);
    click('Deal 1 menu item 1 weekday label');
    expect(document.querySelector('.structured-admin-editor__preview-weekday-row')).toBeNull();
    expect(JSON.parse(textarea.value)[0].menu_items[0]).not.toHaveProperty('weekdays');
    click('Deal 1 menu item 1 Fri');
    const input = Array.from(document.querySelectorAll('label')).find((label) => label.firstChild?.textContent === 'Item name')!.querySelector('input')!;
    input.focus();
    input.value = 'House margarita';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.activeElement).toBe(input);
    expect(document.body.contains(input)).toBe(true);
    expect(JSON.parse(textarea.value)[0].menu_items[0]).toEqual({ ...ordinaryItem, name: 'House margarita', weekdays: [4] });
    expect(document.querySelector('.structured-admin-editor__preview-copy')?.textContent).toBe('House margarita $8 (Red or white)');
  });
});
