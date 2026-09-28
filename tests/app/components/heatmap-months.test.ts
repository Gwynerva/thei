import { describe, expect, it } from 'vitest';
import {
  heatmapMonthLayout,
  type HeatmapDivider,
  type HeatmapWeek,
} from '#layers/thei/app/components/life/heatmap-months';

/** A year as the heatmap lays it out: calendar weeks, padded at both ends. */
function yearWeeks(year: number, weekStartsMonday: boolean): HeatmapWeek[] {
  const first = new Date(Date.UTC(year, 0, 1));
  const offset = weekStartsMonday
    ? (first.getUTCDay() + 6) % 7
    : first.getUTCDay();
  const days: ({ date: string } | undefined)[] = Array(offset).fill(undefined);
  for (
    const cursor = new Date(first);
    cursor.getUTCFullYear() === year;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  )
    days.push({ date: cursor.toISOString().slice(0, 10) });
  while (days.length % 7) days.push(undefined);
  return Array.from({ length: days.length / 7 }, (_, index) => ({
    days: days.slice(index * 7, index * 7 + 7),
  }));
}

const label = (month: number) => `m${month + 1}`;

/**
 * Which side of the month borders a cell is on: how many of them lie to its
 * left, followed along the cell's own row.
 */
function monthOfCell(
  dividers: HeatmapDivider[],
  week: number,
  row: number,
): number {
  return dividers.filter((divider) => {
    if (divider.kind !== 'vertical') return false;
    return divider.at <= week && divider.from <= row && row < divider.to;
  }).length;
}

describe('heatmapMonthLayout', () => {
  it('puts every day on its own month’s side of the borders', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028])
      for (const monday of [true, false]) {
        const weeks = yearWeeks(year, monday);
        const { dividers } = heatmapMonthLayout(weeks, label);
        weeks.forEach((week, index) =>
          week.days.forEach((day, row) => {
            if (!day) return;
            expect(monthOfCell(dividers, index, row), day.date).toBe(
              Number(day.date.slice(5, 7)) - 1,
            );
          }),
        );
      }
  });

  it('steps around a week split between two months', () => {
    // 1 September 2026 is a Tuesday: the second row of its week.
    const weeks = yearWeeks(2026, true);
    const week = weeks.findIndex((item) =>
      item.days.some((day) => day?.date === '2026-09-01'),
    );
    const { dividers } = heatmapMonthLayout(weeks, label);
    expect(dividers.filter((divider) => divider.key.startsWith('8:'))).toEqual([
      expect.objectContaining({ kind: 'vertical', at: week, from: 1, to: 7 }),
      expect.objectContaining({ kind: 'horizontal', at: week, row: 1 }),
      expect.objectContaining({
        kind: 'vertical',
        at: week + 1,
        from: 0,
        to: 1,
      }),
    ]);
  });

  it('draws one straight border for a month that starts a week', () => {
    // 1 June 2026 is a Monday.
    const weeks = yearWeeks(2026, true);
    const week = weeks.findIndex((item) => item.days[0]?.date === '2026-06-01');
    const { dividers } = heatmapMonthLayout(weeks, label);
    expect(dividers.filter((divider) => divider.key.startsWith('5:'))).toEqual([
      expect.objectContaining({ kind: 'vertical', at: week, from: 0, to: 7 }),
    ]);
  });

  it('opens the grid with January, with no border before it', () => {
    const { dividers, labels } = heatmapMonthLayout(
      yearWeeks(2026, true),
      label,
    );
    expect(dividers.some((divider) => divider.key.startsWith('0:'))).toBe(
      false,
    );
    expect(labels.map((item) => item.label)).toEqual(
      Array.from({ length: 12 }, (_, month) => `m${month + 1}`),
    );
  });

  it('centres each label between the tops of the borders around it', () => {
    for (const monday of [true, false]) {
      const weeks = yearWeeks(2026, monday);
      const { dividers, labels } = heatmapMonthLayout(weeks, label);
      // Where each border meets the labels' row; the grid's edges close it.
      const tops = [
        0,
        ...dividers
          .filter(
            (divider) => divider.kind === 'vertical' && divider.from === 0,
          )
          .map((divider) => divider.at),
        weeks.length,
      ];
      expect(labels.map((item) => item.at)).toEqual(
        labels.map((_, month) => (tops[month]! + tops[month + 1]!) / 2),
      );
    }
  });
});
