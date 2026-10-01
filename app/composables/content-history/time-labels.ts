/** The start of the local day a moment falls on. */
export function localDayStart(value: number | Date): number {
  const date = new Date(value);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/** A moment as the history names it within its day: to the minute, 24-hour. */
export function historyTime(value: number) {
  return new Intl.DateTimeFormat(language.value.code, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}

/** How the history names a moment: its time, and its day relative to today. */
export function useHistoryTimeLabels() {
  function dayLabel(value: number) {
    const dayStart = localDayStart(value);
    const todayStart = localDayStart(Date.now());
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dayStart === todayStart || dayStart === yesterday.getTime()) {
      return new Intl.RelativeTimeFormat(language.value.code, {
        numeric: 'auto',
      }).format(dayStart === todayStart ? 0 : -1, 'day');
    }
    return new Intl.DateTimeFormat(language.value.code, {
      dateStyle: 'long',
    }).format(dayStart);
  }

  return { time: historyTime, dayLabel };
}

/** Groups versions, newest first, under the local day they were written. */
export function groupHistoryByDay<T extends { updatedAt: number }>(
  entries: readonly T[],
): { dayStart: number; entries: T[] }[] {
  const groups = new Map<number, T[]>();
  for (const entry of entries) {
    const dayStart = localDayStart(entry.updatedAt);
    const group = groups.get(dayStart);
    if (group) group.push(entry);
    else groups.set(dayStart, [entry]);
  }
  return Array.from(groups, ([dayStart, items]) => ({
    dayStart,
    entries: items.sort((left, right) => right.updatedAt - left.updatedAt),
  })).sort((left, right) => right.dayStart - left.dayStart);
}
