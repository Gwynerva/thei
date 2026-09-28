/**
 * Where the months of an activity grid begin and end.
 *
 * The grid's columns are calendar weeks, so a month rarely starts on a column
 * edge: the week holding its 1st is split between two months. A border drawn
 * between columns would put some of those days on the wrong side, so the
 * border steps around them instead — down the gap before that week for the
 * new month's days, across the week between the two months' days, and down
 * the gap after it for the old month's. It runs through the grid's ordinary
 * gaps, so every gap stays the same.
 *
 * Positions are in the units `.heatmap-at` reads: `at` counts weeks, and a
 * whole number is the middle of the gap before that week. Rows run 0–7: a
 * border from row 0 starts under the month labels, one to row 7 runs a gap
 * past the last row.
 */
export type HeatmapWeek = { days: readonly ({ date: string } | undefined)[] };

export type HeatmapDivider =
  | { kind: 'vertical'; key: string; at: number; from: number; to: number }
  | { kind: 'horizontal'; key: string; at: number; row: number };

export type HeatmapMonthLabel = { key: number; label: string; at: number };

export type HeatmapMonthLayout = {
  dividers: HeatmapDivider[];
  labels: HeatmapMonthLabel[];
};

export function heatmapMonthLayout(
  weeks: readonly HeatmapWeek[],
  monthLabel: (month: number) => string,
): HeatmapMonthLayout {
  const firsts = new Map<number, { week: number; row: number }>();
  const lastWeeks = new Map<number, number>();
  weeks.forEach((week, index) =>
    week.days.forEach((day, row) => {
      if (!day) return;
      const month = Number(day.date.slice(5, 7)) - 1;
      if (!firsts.has(month)) firsts.set(month, { week: index, row });
      lastWeeks.set(month, index);
    }),
  );
  const months = [...firsts.keys()].sort((left, right) => left - right);

  // The grid opens with its first month: there is no border before it.
  const dividers: HeatmapDivider[] = [];
  for (const month of months.slice(1)) {
    const { week, row } = firsts.get(month)!;
    if (row === 0) {
      dividers.push({
        kind: 'vertical',
        key: `${month}:${week}`,
        at: week,
        from: 0,
        to: 7,
      });
      continue;
    }
    dividers.push(
      {
        kind: 'vertical',
        key: `${month}:${week}`,
        at: week,
        from: row,
        to: 7,
      },
      { kind: 'horizontal', key: `${month}:across`, at: week, row },
      {
        kind: 'vertical',
        key: `${month}:${week + 1}`,
        at: week + 1,
        from: 0,
        to: row,
      },
    );
  }

  // Each label centres between the borders where they meet the labels' row:
  // the gap a border comes up through, which for a month that starts inside
  // a week is the gap after that week. The grid's own edges close the ends.
  const top = (month: number) => {
    const { week, row } = firsts.get(month)!;
    return row === 0 ? week : week + 1;
  };
  const labels = months.map((month, index) => ({
    key: month,
    label: monthLabel(month),
    at:
      ((index === 0 ? 0 : top(month)) +
        (index === months.length - 1
          ? lastWeeks.get(month)! + 1
          : top(months[index + 1]!))) /
      2,
  }));

  return { dividers, labels };
}
