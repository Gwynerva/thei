import type { AiTemplateSchedule } from '#layers/thei/shared/ai';
import { refuse as fail } from '../../entity-patch/text';

/**
 * When a template runs: a time of day in the owner's time zone — every day,
 * on one day of the week, or on the first of the month. The next run is kept
 * in the database, so it outlives a restart; a run missed while the site was
 * down happens once when it is back, and is not caught up on.
 */

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function zoneOf(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** A moment's calendar day and wall-clock time in a time zone. */
function partsIn(at: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** The moment a wall-clock time of a calendar day falls at in a zone. */
function zoned(
  day: { year: number; month: number; day: number },
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const wanted = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
  let guess = wanted;
  // Twice: the zone's offset may change between the guess and the answer.
  for (let step = 0; step < 2; step++) {
    const seen = partsIn(guess, timeZone);
    guess +=
      wanted -
      Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  }
  return guess;
}

/** The first run of a schedule after `after`; none for a manual one. */
export function nextRunAt(
  schedule: AiTemplateSchedule,
  after: number,
): number | null {
  if (schedule.kind === 'manual') return null;
  const timeZone = zoneOf(schedule.timeZone);
  const [hour, minute] = schedule.time.split(':').map(Number) as [
    number,
    number,
  ];
  const today = partsIn(after, timeZone);
  for (let offset = 0; offset < 40; offset++) {
    const date = new Date(
      Date.UTC(today.year, today.month - 1, today.day + offset),
    );
    const day = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
    // Monday is 1, Sunday 7.
    const weekday = ((date.getUTCDay() + 6) % 7) + 1;
    if (schedule.kind === 'week' && weekday !== schedule.day) continue;
    if (schedule.kind === 'month' && day.day !== 1) continue;
    const at = zoned(day, hour, minute, timeZone);
    if (at > after) return at;
  }
  return null;
}

/** A schedule as a page sent it, checked. */
export function checkedSchedule(value: unknown): AiTemplateSchedule {
  const input = (value ?? {}) as Record<string, unknown>;
  if (input.kind === 'manual') return { kind: 'manual' };
  if (typeof input.time !== 'string' || !TIME.test(input.time))
    fail('The time is HH:MM.');
  const timeZone =
    typeof input.timeZone === 'string' ? zoneOf(input.timeZone) : 'UTC';
  switch (input.kind) {
    case 'day':
      return { kind: 'day', time: input.time, timeZone };
    case 'month':
      return { kind: 'month', time: input.time, timeZone };
    case 'week': {
      const day = Number(input.day);
      if (!Number.isInteger(day) || day < 1 || day > 7)
        fail('A day of the week is 1 to 7, from Monday.');
      return { kind: 'week', day, time: input.time, timeZone };
    }
    default:
      fail('A schedule is manual, day, week or month.');
  }
}
