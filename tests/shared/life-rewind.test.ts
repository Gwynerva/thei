import { describe, expect, it } from 'vitest';
import { selectLifeRewindPoints } from '../../shared/life-rewind';
import type { LifeBoundaryLike } from '../../shared/life-timeline';

function point(
  identity: string,
  date: string,
  transition: LifeBoundaryLike['transition'] = 'created',
): LifeBoundaryLike {
  return {
    identity,
    date,
    transition,
    entityKind: identity.split(':')[0]!,
    sortTime: Date.parse(date),
  };
}
function period(identity: string, start: string, end: string, index = 0) {
  return [
    point(`${identity}:period:${index}`, start, 'started'),
    point(`${identity}:period:${index}`, end, 'ended'),
  ];
}
const today = '2026-09-10';

describe('Life rewind selection', () => {
  it('matches all point kinds in previous years only', () => {
    const kinds = [
      'project',
      'page',
      'project-section',
      'profile-avatar',
      'profile-status',
    ];
    const points = kinds.map((kind) => point(`${kind}:id`, '2025-09-10'));
    const selected = selectLifeRewindPoints(
      [
        ...points,
        point('project:current', today),
        point('project:future', '2027-09-10'),
        point('project:other-day', '2025-09-11'),
      ],
      today,
    );
    expect(selected).toHaveLength(5);
    expect(selected.every((item) => item.match === 'exact')).toBe(true);
    expect(new Set(selected.map((item) => item.point.entityKind))).toEqual(
      new Set(kinds),
    );
  });

  it.each(['event', 'project-stage'])(
    'keeps the boundaries and middle of %s periods',
    (kind) => {
      const points = period(`${kind}:id`, '2025-09-09', '2025-09-11');
      expect(selectLifeRewindPoints(points, '2026-09-09')[0]).toMatchObject({
        match: 'exact',
        point: { transition: 'started', date: '2025-09-09' },
      });
      expect(selectLifeRewindPoints(points, today)[0]).toMatchObject({
        match: 'ongoing',
        point: {
          date: '2025-09-10',
          period: { startDate: '2025-09-09', endDate: '2025-09-11' },
        },
      });
      expect(selectLifeRewindPoints(points, '2026-09-11')[0]).toMatchObject({
        match: 'exact',
        point: { transition: 'ended' },
      });
      expect(selectLifeRewindPoints(points, '2026-09-12')).toEqual([]);
    },
  );

  it('represents a single-day period once', () => {
    expect(
      selectLifeRewindPoints(
        period('event:id', '2025-09-10', '2025-09-10'),
        today,
      ),
    ).toMatchObject([
      { match: 'exact', point: { transition: 'occurred', period: undefined } },
    ]);
  });

  it('does not bridge the gaps between periods', () => {
    expect(
      selectLifeRewindPoints(
        [
          ...period('event:id', '2025-09-01', '2025-09-09'),
          ...period('event:id', '2025-09-11', '2025-09-15', 1),
        ],
        today,
      ),
    ).toEqual([]);
  });

  it('keeps one match for each past year of a long stage, newest first', () => {
    const selected = selectLifeRewindPoints(
      period('project-stage:id', '2023-01-01', '2027-01-01'),
      today,
    );
    expect(selected.map((item) => item.point.date)).toEqual([
      '2025-09-10',
      '2024-09-10',
      '2023-09-10',
    ]);
    expect(selected.every((item) => item.match === 'ongoing')).toBe(true);
  });

  it('handles periods across December and January', () => {
    expect(
      selectLifeRewindPoints(
        period('event:id', '2024-12-30', '2025-01-02'),
        '2026-01-01',
      ),
    ).toMatchObject([{ point: { date: '2025-01-01' }, match: 'ongoing' }]);
  });

  it('deduplicates entity/year matches and prioritizes exact boundaries', () => {
    const points = [
      ...period('event:id', '2025-09-01', '2025-09-20'),
      ...period('event:id', '2025-09-10', '2025-09-15', 1),
    ];
    const selected = selectLifeRewindPoints(points, today);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      match: 'exact',
      point: { transition: 'started', period: { startDate: '2025-09-10' } },
    });
    expect(selectLifeRewindPoints([...points].reverse(), today)).toEqual(
      selected,
    );
  });

  it('matches leap days only in leap years without shifting the date', () => {
    const points = period('event:id', '2019-01-01', '2027-01-01');
    expect(
      selectLifeRewindPoints(points, '2028-02-29').map(
        (item) => item.point.date,
      ),
    ).toEqual(['2024-02-29', '2020-02-29']);
    expect(
      selectLifeRewindPoints([point('project:id', '2024-02-29')], '2025-02-28'),
    ).toEqual([]);
    expect(selectLifeRewindPoints(points, '2025-02-29')).toEqual([]);
  });
});
