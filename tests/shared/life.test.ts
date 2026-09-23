import { describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import en from '../../shared/language/list/en';
import ru from '../../shared/language/list/ru';
import {
  buildLifeUrl,
  isLifeDay,
  isLifeDayNew,
  laterLifeDate,
  normalizeLifeLastViewedDate,
  parseLifeFilter,
  serializeLifeFilter,
} from '../../shared/life';
import {
  lifeGapDuration,
  lifeGapDays,
  lifeGapStyle,
  lifePointIsVisible,
  mergeLifeBoundaryPoints,
  projectCreatedUtcDate,
  selectActiveLifeDay,
  sortLifePoints,
} from '../../shared/life-timeline';

const point = (
  identity: string,
  date: string,
  transition: 'started' | 'ended' | 'occurred' | 'created',
  sortTime = Date.parse(`${date}T12:00:00Z`),
  entityKind = 'event',
) => ({ identity, date, transition, sortTime, entityKind });

describe('Life periods', () => {
  it('validates only real calendar days', () => {
    expect(isLifeDay('2024-02-29')).toBe(true);
    expect(isLifeDay('2026-02-29')).toBe(false);
    expect(isLifeDay('2026-13-01')).toBe(false);
    expect(isLifeDay('2026-02')).toBe(false);
    expect(isLifeDay('2026-01-01-extra')).toBe(false);
  });

  it('carries the day and the filter in the query string', () => {
    expect(buildLifeUrl()).toBe('/life/');
    expect(buildLifeUrl({ date: '2026-08-22' })).toBe('/life/?d=2026-08-22');
    expect(buildLifeUrl({ date: '2026-08-22', filter: ['event'] })).toBe(
      '/life/?d=2026-08-22&f=event',
    );
    expect(
      buildLifeUrl({ date: '2026-08-22' }, '/projects/x-Y/timeline/'),
    ).toBe('/projects/x-Y/timeline/?d=2026-08-22');
  });

  it('reads a filter back, and treats "all kinds" as no filter', () => {
    expect(parseLifeFilter('event,page')).toEqual(['event', 'page']);
    // Unknown kinds are dropped rather than failing the whole address.
    expect(parseLifeFilter('event,nonsense')).toEqual(['event']);
    expect(parseLifeFilter('')).toBeUndefined();
    expect(parseLifeFilter('nonsense')).toBeUndefined();
    expect(
      parseLifeFilter(
        'event,project,page,project-stage,project-section,profile-avatar,profile-status,diary-entry',
      ),
    ).toBeUndefined();
    expect(serializeLifeFilter(undefined)).toBeUndefined();
    expect(serializeLifeFilter(['event', 'page'])).toBe('event,page');
  });

  it('offers a project only the kinds a project can hold', () => {
    const scope = { kind: 'project' as const, projectUuid: 'p' };
    expect(parseLifeFilter('event,profile-avatar', scope)).toEqual(['event']);
    expect(
      parseLifeFilter(
        'event,project-stage,project-section,profile-status,diary-entry',
        scope,
      ),
    ).toBeUndefined();
  });

  it('normalizes and compares last-viewed day markers', () => {
    expect(normalizeLifeLastViewedDate('bad', '2026-08-22')).toBeUndefined();
    expect(normalizeLifeLastViewedDate('2026-09-01', '2026-08-22')).toBe(
      '2026-08-22',
    );
    expect(normalizeLifeLastViewedDate('2026-08-20', '2026-08-22')).toBe(
      '2026-08-20',
    );
    expect(isLifeDayNew('2026-08-21', '2026-08-20')).toBe(true);
    expect(isLifeDayNew('2026-08-20', '2026-08-20')).toBe(false);
    expect(isLifeDayNew('2026-08-21', undefined)).toBe(false);
    expect(laterLifeDate('2026-08-21', '2026-08-20')).toBe('2026-08-21');
  });
});

describe('Life point construction', () => {
  it('merges same-day start and end into one occurred point', () => {
    const merged = mergeLifeBoundaryPoints([
      point('event:a', '2026-08-22', 'started'),
      point('event:a', '2026-08-22', 'ended'),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.transition).toBe('occurred');
    expect(merged[0]!.period).toBeUndefined();
  });

  it('merges boundaries in adjacent date blocks despite other cards', () => {
    const merged = mergeLifeBoundaryPoints([
      point('event:a:period:0', '2026-08-21', 'started'),
      point('event:a:period:0', '2026-08-22', 'ended'),
      point('project:a', '2026-08-21', 'created', 1, 'project'),
      point('project:b', '2026-08-22', 'created', 2, 'project'),
    ]);
    const occurred = merged.find(
      ({ identity }) => identity === 'event:a:period:0',
    );
    expect(occurred).toMatchObject({
      transition: 'occurred',
      date: '2026-08-22',
      period: { startDate: '2026-08-21', endDate: '2026-08-22' },
    });
    expect(merged).toHaveLength(3);
  });

  it('does not merge boundaries with another date block between them', () => {
    const merged = mergeLifeBoundaryPoints([
      point('event:a:period:0', '2026-08-20', 'started'),
      point('event:a:period:0', '2026-08-22', 'ended'),
      point('project:a', '2026-08-21', 'created', 1, 'project'),
    ]);
    expect(
      merged.filter(({ identity }) => identity === 'event:a:period:0'),
    ).toHaveLength(2);
  });

  it('merges event and project-stage periods independently', () => {
    const merged = mergeLifeBoundaryPoints([
      point('event:a:period:0', '2026-08-21', 'started'),
      point('event:a:period:0', '2026-08-22', 'ended'),
      point(
        'project-stage:a:period:0',
        '2026-08-21',
        'started',
        undefined,
        'project-stage',
      ),
      point(
        'project-stage:a:period:0',
        '2026-08-22',
        'ended',
        undefined,
        'project-stage',
      ),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.every(({ transition }) => transition === 'occurred')).toBe(
      true,
    );
  });

  it('keeps multiple periods of one entity distinct by identity', () => {
    const merged = mergeLifeBoundaryPoints([
      point('event:a:period:0', '2026-08-19', 'started'),
      point('event:a:period:0', '2026-08-20', 'ended'),
      point('event:a:period:1', '2026-08-21', 'started'),
      point('event:a:period:1', '2026-08-22', 'ended'),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map(({ identity }) => identity).sort()).toEqual([
      'event:a:period:0',
      'event:a:period:1',
    ]);
  });

  it('does not cascade after a merged block becomes empty', () => {
    const merged = mergeLifeBoundaryPoints([
      point('event:a:period:0', '2026-08-21', 'started'),
      point('event:a:period:0', '2026-08-21', 'ended'),
      point('event:b:period:0', '2026-08-20', 'started'),
      point('event:b:period:0', '2026-08-22', 'ended'),
    ]);
    expect(
      merged.filter(({ identity }) => identity === 'event:b:period:0'),
    ).toHaveLength(2);
  });

  it('orders end, project creation, occurred, and start deterministically', () => {
    const ordered = sortLifePoints([
      point('event:z', '2026-08-22', 'started'),
      point('event:b', '2026-08-22', 'occurred'),
      point('project:a', '2026-08-22', 'created', 1, 'project'),
      point('event:a', '2026-08-22', 'ended'),
    ]);
    expect(ordered.map((item) => item.transition)).toEqual([
      'ended',
      'created',
      'occurred',
      'started',
    ]);
  });

  it('orders page and section creation points alongside projects', () => {
    const ordered = sortLifePoints([
      point('project-section:b', '2026-08-22', 'created', 2, 'project-section'),
      point('project:a', '2026-08-22', 'created', 1, 'project'),
      point('page:a', '2026-08-22', 'created', 4, 'page'),
      point('project-section:a', '2026-08-22', 'created', 3, 'project-section'),
    ]);
    expect(ordered.map((item) => item.identity)).toEqual([
      'page:a',
      'project-section:a',
      'project-section:b',
      'project:a',
    ]);
  });

  it('groups project timestamps by their UTC day', () => {
    expect(projectCreatedUtcDate('2026-08-21T23:30:00-03:00')).toBe(
      '2026-08-22',
    );
  });

  it('redacts public and link-only points equally for a visitor', () => {
    expect(
      lifePointIsVisible(ProjectEventAccessLevel.Public, false, false),
    ).toBe(true);
    expect(
      lifePointIsVisible(ProjectEventAccessLevel.LinkOnly, false, false),
    ).toBe(false);
    expect(
      lifePointIsVisible(ProjectEventAccessLevel.Private, false, false),
    ).toBe(false);
    expect(
      lifePointIsVisible(ProjectEventAccessLevel.Public, true, false),
    ).toBe(false);
    expect(
      lifePointIsVisible(ProjectEventAccessLevel.Private, true, true),
    ).toBe(true);
  });
});

describe('Life gaps', () => {
  it('measures date gaps directionally in UTC days', () => {
    expect(lifeGapDays('2026-08-22', '2026-08-21')).toBe(1);
    expect(lifeGapDays('2026-09-10', '2026-08-22')).toBe(19);
  });

  it('splits gaps into exact clamped UTC calendar parts', () => {
    expect(lifeGapDuration('2026-03-05', '2026-01-31')).toEqual({
      years: 0,
      months: 1,
      days: 5,
    });
    expect(lifeGapDuration('2026-03-02', '2024-02-29')).toEqual({
      years: 2,
      months: 0,
      days: 2,
    });
  });

  it('formats localized compound durations', () => {
    expect(ru.phrases?.life_gap?.(2, 3, 1)).toBe(
      'через 2 года, 3 месяца и 1 день',
    );
    expect(en.phrases.life_gap(0, 1, 5)).toBe('in 1 month and 5 days');
  });
});

describe('Life active day selection', () => {
  const rect = (date: string, top: number, bottom: number) => ({
    date,
    top,
    bottom,
  });

  it('selects the uppermost fully visible day below the sticky stack', () => {
    expect(
      selectActiveLifeDay(
        [
          rect('2026-08-23', 80, 180),
          rect('2026-08-22', 200, 420),
          rect('2026-08-21', 440, 680),
        ],
        150,
        720,
      ),
    ).toBe('2026-08-22');
  });

  it('prefers a fully visible day over a partially visible upper day', () => {
    expect(
      selectActiveLifeDay(
        [rect('2026-08-23', 120, 190), rect('2026-08-22', 210, 500)],
        150,
        720,
      ),
    ).toBe('2026-08-22');
  });

  it('uses the uppermost intersecting day when none fits fully', () => {
    expect(
      selectActiveLifeDay(
        [rect('2026-08-23', 100, 650), rect('2026-08-22', 670, 900)],
        150,
        720,
      ),
    ).toBe('2026-08-23');
  });

  it('keeps an oversized day active while it crosses the viewport', () => {
    expect(
      selectActiveLifeDay(
        [rect('2026-08-23', -300, 900), rect('2026-08-22', 950, 1100)],
        150,
        720,
      ),
    ).toBe('2026-08-23');
  });

  it('allows a one-pixel tolerance for fractional layout coordinates', () => {
    expect(
      selectActiveLifeDay([rect('2026-08-23', 149.25, 720.75)], 150, 720),
    ).toBe('2026-08-23');
  });

  it('returns undefined for an empty or invalid geometry set', () => {
    expect(selectActiveLifeDay([], 150, 720)).toBeUndefined();
    expect(
      selectActiveLifeDay([rect('2026-08-23', Number.NaN, 400)], 150, 720),
    ).toBeUndefined();
  });
});

describe('Life gap styles', () => {
  it('reads a gap as a pause, a silence, or a break in the thread', () => {
    const style = (years: number, months: number, days: number) =>
      lifeGapStyle({ years, months, days });
    expect(style(0, 0, 1)).toBe('dash');
    expect(style(0, 0, 29)).toBe('dash');
    expect(style(0, 1, 0)).toBe('dotted');
    expect(style(0, 3, 0)).toBe('dotted');
    expect(style(0, 3, 29)).toBe('dotted');
    expect(style(0, 4, 0)).toBe('severed');
    expect(style(1, 0, 0)).toBe('severed');
  });
});
