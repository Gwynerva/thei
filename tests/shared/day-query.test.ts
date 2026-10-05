import { describe, expect, it } from 'vitest';
import {
  dayQueryRank,
  matchesDayQuery,
  parseDayQuery,
} from '../../shared/day-query';

const days = [
  '2023-05-12',
  '2024-03-12',
  '2024-05-01',
  '2024-05-12',
  '2024-05-19',
  '2024-06-05',
  '2024-12-05',
  '2025-01-10',
];

/** The days a query finds, the closest first, then the newest. */
function found(query: string) {
  const parsed = parseDayQuery(query);
  if (!parsed) return undefined;
  return days
    .map((day) => ({ day, rank: dayQueryRank(day, parsed) }))
    .filter((entry): entry is { day: string; rank: number } =>
      Boolean(entry.rank !== undefined),
    )
    .sort((a, b) => a.rank - b.rank || b.day.localeCompare(a.day))
    .map(({ day }) => day);
}

describe('a day written in numbers', () => {
  it('reads the parts in any order, with any separator', () => {
    for (const query of [
      '2024-05-12',
      '2024.05.12',
      '2024/5/12',
      '2024 5 12',
      '12.05.2024',
      '12-5-2024',
      '12/05/2024.',
      '2024.12.05',
    ])
      expect(found(query)?.[0], query).toBe(
        query === '2024.12.05' ? '2024-12-05' : '2024-05-12',
      );
  });

  it('reads a month first, as in the United States', () => {
    expect(found('05/19/2024')).toEqual(['2024-05-19']);
  });

  it('finds both days a written day may be, the day first', () => {
    expect(found('05.06.2024')).toEqual(['2024-06-05']);
    expect(found('05.12.2024 ')).toEqual(['2024-12-05', '2024-05-12']);
    expect(found('12.05.2024 ')).toEqual(['2024-05-12', '2024-12-05']);
  });

  it('reads a year written with two digits when the day is whole', () => {
    expect(found('12.05.24 ')).toEqual(['2024-05-12', '2024-12-05']);
    expect(found('12.05.23 ')).toEqual(['2023-05-12']);
  });

  it('finds the days of a year and of a month', () => {
    expect(found('2025')).toEqual(['2025-01-10']);
    expect(found('2024.06')).toEqual(['2024-06-05']);
    expect(found('06.2024')).toEqual(['2024-06-05']);
    expect(found('2024-5')).toEqual(['2024-05-19', '2024-05-12', '2024-05-01']);
  });

  it('finds a day of a month in any year', () => {
    expect(found('12.05 ')).toEqual(['2024-05-12', '2023-05-12', '2024-12-05']);
  });

  it('reads a day of the month alone, or a month by its number, as nothing', () => {
    expect(parseDayQuery('12 ')).toBeUndefined();
    expect(parseDayQuery('5.')).toBeUndefined();
    expect(found('12')).toEqual([]);
  });
});

describe('a month written as a word', () => {
  it('reads Russian months in any of their forms', () => {
    expect(found('12 мая 2024')).toEqual(['2024-05-12']);
    expect(found('май 2024')).toEqual([
      '2024-05-19',
      '2024-05-12',
      '2024-05-01',
    ]);
    expect(found('в мае 2023')).toEqual(['2023-05-12']);
    expect(found('2024, 12 марта')).toEqual(['2024-03-12']);
    expect(found('12-го декабря 2024 г.')).toEqual([]);
    expect(found('5-е декабря 2024 г.')).toEqual(['2024-12-05']);
  });

  it('reads English months, with ordinals', () => {
    expect(found('May 12th, 2024')).toEqual(['2024-05-12']);
    expect(found('12 May 2024')).toEqual(['2024-05-12']);
    expect(found('the 1st of May 2024')).toEqual(['2024-05-01']);
    expect(found('june 2024')).toEqual(['2024-06-05']);
  });

  it('reads a month cut short, and a word stuck to its number', () => {
    expect(found('12 янв. 2025')).toEqual([]);
    expect(found('10 янв. 2025')).toEqual(['2025-01-10']);
    expect(found('5 сент')).toEqual([]);
    expect(found('Dec 5, 2024')).toEqual(['2024-12-05']);
    expect(found('12мая2024')).toEqual(['2024-05-12']);
    expect(found('2024г')).toEqual(
      days.filter((day) => day.startsWith('2024')).reverse(),
    );
  });

  it('finds every day of a month named alone, whatever the year', () => {
    expect(found('мая')).toEqual([
      '2024-05-19',
      '2024-05-12',
      '2024-05-01',
      '2023-05-12',
    ]);
    expect(found('December')).toEqual(['2024-12-05']);
  });

  it('reads no more than one month', () => {
    expect(parseDayQuery('май июнь')).toBeUndefined();
  });
});

describe('a day still being typed', () => {
  it('matches what an unfinished number begins', () => {
    expect(found('2024-0')).toEqual([
      '2024-06-05',
      '2024-05-19',
      '2024-05-12',
      '2024-05-01',
      '2024-03-12',
    ]);
    // The 5th of a month that begins with 1 comes last: a year, a day, then
    // a month is an order people rarely write.
    expect(found('2024-05-1')).toEqual([
      '2024-05-01',
      '2024-05-19',
      '2024-05-12',
      '2024-12-05',
    ]);
  });

  it('matches what an unfinished month begins after a number', () => {
    expect(found('12 ма')).toEqual(['2024-05-12', '2024-03-12', '2023-05-12']);
    expect(found('12 м ')).toBeUndefined();
    expect(parseDayQuery('ма')).toBeUndefined();
  });

  it('takes a word that goes with a day before it is finished', () => {
    expect(found('2025 го')).toEqual(['2025-01-10']);
  });
});

describe('text that is not a day', () => {
  it('is not read as one', () => {
    for (const query of [
      'studio 2024',
      'Lantern Harbor',
      '',
      '   ',
      '20240512',
    ])
      expect(parseDayQuery(query), query).toBeUndefined();
  });

  it('answers a plain question about one day', () => {
    expect(matchesDayQuery('2024-05-12', '12 мая')).toBe(true);
    expect(matchesDayQuery('2024-05-12', '13 мая')).toBe(false);
    expect(matchesDayQuery('2024-05-12', 'studio')).toBe(false);
  });
});
