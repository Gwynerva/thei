/** How the history names a moment: its time, and its day relative to today. */
export function useHistoryTimeLabels() {
  function time(value: number) {
    return new Intl.DateTimeFormat(language.value.code, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(value);
  }

  function dayLabel(value: number) {
    const date = new Date(value);
    const dayStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime();
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
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

  return { time, dayLabel };
}
