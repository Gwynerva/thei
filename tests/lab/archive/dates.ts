// Days as the archive writes them: absolute, or relative to the day a site
// is seeded (FORMAT.md, "Relative days").

const RELATIVE = /^today(?:([+-])(\d+))?$/;

/** The local day of a moment, `YYYY-MM-DD`. */
export function localDay(at = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const moment = new Date(Date.UTC(year, month - 1, date + days));
  return moment.toISOString().slice(0, 10);
}

export function isRelativeDay(value: string): boolean {
  return RELATIVE.test(value);
}

/** `today+3` against the seed day; an absolute day as it is. */
export function resolveDay(value: string, seedDay: string): string {
  const match = RELATIVE.exec(value);
  if (!match) return value;
  const amount = Number(match[2] ?? 0) * (match[1] === '-' ? -1 : 1);
  return addDays(seedDay, amount);
}

/** Whether a day is a real calendar day. */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, date] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const moment = new Date(Date.UTC(year, month - 1, date));
  return moment.getUTCMonth() === month - 1 && moment.getUTCDate() === date;
}
