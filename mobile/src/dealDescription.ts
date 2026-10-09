import type { BusinessDealMenuItem } from './types';
import { formatMenuItemWeekdays } from './businessProfileOverrides';

export type DealDescriptionRow = {
  label: string | null;
  text: string;
  descriptionPrice?: string;
  menuItem?: DealMenuItem;
};

export type DealMenuItem = {
  name: string;
  price: string;
  detail: string | null;
  kind: 'cost' | 'discount' | 'other';
  sortPrice: number | null;
};

const weekday = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri|Sat|Sun)';
const weekdayPrefix = new RegExp(`^(${weekday}(?:\\s*(?:-|–|—|to|through)\\s*${weekday})?)\\s*(?:[-–—:]\\s*)(.+)$`, 'i');

const amountSource = '\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?';
const menuPriceSource = `\\$${amountSource}(?:\\s*[-–—]\\s*\\$?${amountSource})?(?:\\s+(?:off|each))?`;
const menuItemPattern = new RegExp(`^(.+?)\\s+(${menuPriceSource})([\\s\\S]*)$`, 'i');
const exactCostPattern = new RegExp(`^\\$(${amountSource})(?:\\s+each)?$`, 'i');
const prosePrefix = /^(?:terms?|notes?|restrictions?|please|ask|see|visit|available|subject|prices?)\b/i;
const contextualPrice = /\b(?:for|from|at|only|save|starting at|up to|as low as|under)\s*$|^(?:add|extra|upgrade)\b|%/i;
const writtenWeekday = new RegExp(`\\b${weekday}\\b`, 'i');
const writtenTime = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;

/** Parentheses can contain prices, commas, and nested options without creating another item. */
function isParentheticalDetail(detail: string): boolean {
  if (!detail.startsWith('(')) {
    return false;
  }
  let depth = 0;
  for (const character of detail) {
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    } else if (depth === 0 && !/[\s.!]/.test(character)) {
      return false;
    }
  }
  return depth === 0;
}

/** Extract only a clearly written item/price pair, optionally followed by its description. */
export function parseDealMenuItem(text: string): DealMenuItem | null {
  const match = text.match(menuItemPattern);
  if (!match) {
    return null;
  }
  const name = match[1].trim();
  const price = match[2];
  const detail = match[3].trim() || null;
  if (name.length > 120 || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name) || /[$:;!?]/.test(name) || prosePrefix.test(name)) {
    return null;
  }
  if (detail && !isParentheticalDetail(detail)) {
    return null;
  }

  const cost = price.match(exactCostPattern);
  const amount = cost ? Math.round(Number(cost[1].replace(/,/g, '')) * 100) : null;
  const hasSchedule = writtenWeekday.test(name) || writtenWeekday.test(detail ?? '') || writtenTime.test(name) || writtenTime.test(detail ?? '');
  const kind = /\boff$/i.test(price) ? 'discount' : cost && Number.isSafeInteger(amount) && !contextualPrice.test(name) && !hasSchedule ? 'cost' : 'other';
  return {
    name,
    price,
    detail,
    kind,
    sortPrice: kind === 'cost' ? amount : null,
  };
}

/** Split inline menus only when every inferred entry has an explicit item and price. */
function splitMenuParagraph(text: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth < 0) {
        return [text];
      }
    }
    const separator = depth === 0 && (character === ';' || character === '•' || (character === ',' && !/\d/.test(text[index + 1] ?? '')));
    const closedDetail = character === ')' && depth === 0;
    if (separator || closedDetail) {
      let end = separator ? index : index + 1;
      if (closedDetail) {
        while (text[end] === '.' || text[end] === '!') {
          end += 1;
        }
      }
      const entry = text.slice(start, end).trim();
      if (parseDealMenuItem(entry)) {
        entries.push(entry);
        start = separator ? index + 1 : end;
        index = start - 1;
      }
    }
  }
  const remainder = text.slice(start).trim();
  if (remainder) {
    entries.push(remainder);
  }
  return depth === 0 && entries.length > 1 && entries.every((entry) => parseDealMenuItem(entry)) ? entries : [text];
}

/** Sort comparable costs within a menu only; keep discounts in their slots and context in place. */
function sortMenuRows(rows: DealDescriptionRow[]): DealDescriptionRow[] {
  const result: DealDescriptionRow[] = [];
  let menu: DealDescriptionRow[] = [];
  function flushMenu() {
    const priced = menu
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.menuItem?.kind === 'cost')
      .sort((left, right) => (left.row.menuItem!.sortPrice! - right.row.menuItem!.sortPrice!) || left.index - right.index);
    let priceIndex = 0;
    result.push(...menu.map((row) => row.menuItem?.kind === 'cost' ? priced[priceIndex++].row : row));
    menu = [];
  }

  for (const row of rows) {
    if (row.label || !row.menuItem || row.menuItem.kind === 'other') {
      flushMenu();
      result.push(row);
    } else {
      menu.push(row);
    }
  }
  flushMenu();
  return result;
}

/** Align only an explicit, uncomplicated trailing price; keep complex offers intact. */
export function splitTrailingDealPrice(text: string): { text: string; price: string } | null {
  const match = text.match(/^(.+?)\s+(\$\d+(?:[,.]\d+)*(?:\s*[-–]\s*\$?\d+(?:[,.]\d+)*)?(?:\s+(?:off|each))?)$/i);
  if (!match || match[1].includes('$')) {
    return null;
  }
  return { text: match[1], price: match[2] };
}

/** Presentation only: never rewrite the description used by sharing or calendar actions. */
function formatStructuredMenuItems(menuItems: BusinessDealMenuItem[]): DealDescriptionRow[] {
  const rows = menuItems.flatMap((item): DealDescriptionRow[] => {
    const name = item.name.trim();
    const price = item.price.trim();
    const detail = item.detail.trim() || null;
    if (!name) {
      return [];
    }
    const parsed = price ? parseDealMenuItem(name + ' ' + price + (detail ? ' (' + detail + ')' : '')) : null;
    const text = [name, price, detail ? '(' + detail + ')' : ''].filter(Boolean).join(' ');
    const dayLabel = formatMenuItemWeekdays(item.weekdays);
    if (dayLabel) {
      // Days occupy the label column. Keep price inline so this never becomes
      // a cramped three-column day/name/price row or sorts across daily offers.
      return [{ label: dayLabel, text }];
    }
    return [{
      label: null,
      text,
      menuItem: {
        name,
        price,
        detail,
        kind: parsed?.kind ?? 'other',
        sortPrice: parsed?.sortPrice ?? null,
      },
    }];
  });
  return sortMenuRows(rows);
}

export function serializeDealMenuItems(menuItems: BusinessDealMenuItem[] | null | undefined): string {
  return (menuItems ?? [])
    .map((item) => {
      const name = item.name.trim();
      const price = item.price.trim();
      const detail = item.detail.trim();
      if (!name) {
        return '';
      }
      const text = [name, price, detail ? '(' + detail + ')' : ''].filter(Boolean).join(' ');
      const dayLabel = formatMenuItemWeekdays(item.weekdays);
      return dayLabel ? dayLabel + ' - ' + text : text;
    })
    .filter(Boolean)
    .join('\n');
}

export function formatDealDescription(description: string, menuItems: BusinessDealMenuItem[] = [], descriptionPrice = ''): DealDescriptionRow[] {
  const explicitPrice = descriptionPrice.trim();
  let attachedDescriptionPrice = false;
  const rows = description
    .split(/\|\||\r\n|\r|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part): DealDescriptionRow[] => {
      const weekdayMatch = part.match(weekdayPrefix);
      if (weekdayMatch) {
        const row: DealDescriptionRow = { label: weekdayMatch[1], text: weekdayMatch[2] };
        if (explicitPrice && !attachedDescriptionPrice) {
          attachedDescriptionPrice = true;
          const duplicatePrice = splitTrailingDealPrice(row.text);
          if (duplicatePrice?.price !== explicitPrice) {
            row.text += ' ' + explicitPrice;
          }
        }
        return [row];
      }
      if (explicitPrice && !attachedDescriptionPrice) {
        attachedDescriptionPrice = true;
        const duplicatePrice = splitTrailingDealPrice(part);
        return [{
          label: null,
          text: duplicatePrice?.price === explicitPrice ? duplicatePrice.text : part,
          descriptionPrice: explicitPrice,
        }];
      }
      return splitMenuParagraph(part).map((text) => {
        const menuItem = parseDealMenuItem(text);
        return menuItem ? { label: null, text, menuItem } : { label: null, text };
      });
    });
  return [...sortMenuRows(rows), ...formatStructuredMenuItems(menuItems)];
}
