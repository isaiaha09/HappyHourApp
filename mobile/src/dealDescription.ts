export type DealDescriptionRow = {
  label: string | null;
  text: string;
};

const weekday = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri|Sat|Sun)';
const weekdayPrefix = new RegExp(`^(${weekday}(?:\\s*(?:-|–|—|to|through)\\s*${weekday})?)\\s*(?:[-–—:]\\s*)(.+)$`, 'i');

/** Presentation only: never rewrite the description used by sharing or calendar actions. */
export function formatDealDescription(description: string): DealDescriptionRow[] {
  return description
    .split(/\|\||\r\n|\r|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const weekdayMatch = part.match(weekdayPrefix);
      return weekdayMatch
        ? { label: weekdayMatch[1], text: weekdayMatch[2] }
        : { label: null, text: part };
    });
}
