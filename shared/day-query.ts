import { dateWords } from './language/date-words';
import { normalizeTermText } from './text-terms';

/**
 * A search read as a day, or part of one — the way a diary entry, which has
 * no title, is looked for.
 *
 * A person writes a day however they are used to: `2024-05-12`, `12.05.2024`,
 * `5/12/2024`, `12 мая 2024`, `May 12th`, `май 2024`. The query is read in
 * parts — numbers and words, whatever stands between them — and every way its
 * numbers can be a year, a month and a day is tried, in any order. A month
 * may be written as a word, in any form or cut short, in any language Thei
 * speaks.
 *
 * What a query has to name is a day that can be found: a year, a year and a
 * month, a whole day, a day of a month in any year, or a month by its name.
 * A day of the month alone, or a month by its number alone, names nothing, so
 * a lone `12` is not a day.
 *
 * The last part of a query not followed by anything is read as unfinished,
 * since it is most likely still being typed: it matches whatever it begins,
 * so `2024-0` finds the first nine months and `12 ма` finds March and May.
 */
export type DayQuery = { readings: DayReading[] };

type Role = 'year' | 'month' | 'day';

/** 0 when a value is the one written, 1 when an unfinished part begins it. */
type ValueTest = (value: number) => 0 | 1 | undefined;

/** One way to read the query: what it says of the year, month and day. */
type DayReading = Partial<Record<Role, ValueTest>> & {
  /** Where this reading stands among the ways the parts are usually ordered. */
  preference: number;
};

type DayPart =
  | { kind: 'number'; digits: string; open: boolean }
  | { kind: 'month'; test: ValueTest };

/**
 * The orders parts are written in, the most usual first, by how many parts
 * there are. An order missing here names nothing to find: a year and a day
 * without the month between them, say.
 */
const ORDERS: Record<number, string[]> = {
  1: ['y', 'm'],
  2: ['ym', 'my', 'dm', 'md'],
  3: ['ymd', 'dmy', 'mdy', 'ydm', 'dym', 'myd'],
};

const ROLE_LETTER: Record<Role, string> = { year: 'y', month: 'm', day: 'd' };

/** The query as a day, or nothing when it does not read as one. */
export function parseDayQuery(query: string): DayQuery | undefined {
  const text = normalizeTermText(query);
  const tokens = [...text.matchAll(/\d+|\p{L}+/gu)];
  const parts: DayPart[] = [];
  for (const [index, match] of tokens.entries()) {
    const token = match[0];
    const open =
      index === tokens.length - 1 && match.index + token.length === text.length;
    if (/^\d+$/.test(token)) {
      if (token.length > 4) return undefined;
      parts.push({ kind: 'number', digits: token, open });
      continue;
    }
    const afterNumber = parts.some((part) => part.kind === 'number');
    const month = monthPart(token, open, afterNumber);
    if (month) parts.push(month);
    else if (!isFiller(token, open)) return undefined;
  }
  if (!parts.length || parts.length > 3) return undefined;
  if (parts.filter((part) => part.kind === 'month').length > 1)
    return undefined;

  const orders = ORDERS[parts.length]!;
  const numbers = parts.filter((part) => part.kind === 'number');
  const roles: Role[] = parts.some((part) => part.kind === 'month')
    ? ['year', 'day']
    : ['year', 'month', 'day'];
  const readings: DayReading[] = [];
  for (const assignment of arrangements(roles, numbers.length)) {
    // A number alone is only ever a year: a month by its number alone, or a
    // day, names nothing to find.
    if (parts.length === 1 && numbers.length === 1 && assignment[0] !== 'year')
      continue;
    const reading: DayReading = { preference: 0 };
    let order = '';
    let next = 0;
    let valid = true;
    for (const part of parts) {
      const role = part.kind === 'month' ? 'month' : assignment[next++]!;
      const test =
        part.kind === 'month'
          ? part.test
          : numberTest(part, role, parts.length === 3);
      if (!test) {
        valid = false;
        break;
      }
      reading[role] = test;
      order += ROLE_LETTER[role];
    }
    const preference = orders.indexOf(order);
    if (!valid || preference < 0) continue;
    reading.preference = preference;
    readings.push(reading);
  }
  if (!readings.length) return undefined;
  return {
    readings: readings.sort((a, b) => a.preference - b.preference),
  };
}

/**
 * How closely a day — `YYYY-MM-DD` — answers the query, lower being closer,
 * or nothing when it does not. Below 1 is a whole day as written; below 2, a
 * whole day an unfinished part only begins; below 3, part of a day, such as
 * its month; below 4, part of a day an unfinished part only begins. Within
 * each, the usual order of parts comes first: `05.06.2024` is the 5th of June
 * before it is the 6th of May.
 */
export function dayQueryRank(
  date: string,
  query: DayQuery,
): number | undefined {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const values: Record<Role, number> = { year, month, day };
  let best: number | undefined;
  for (const reading of query.readings) {
    let unfinished = false;
    let matches = true;
    for (const role of ['year', 'month', 'day'] as const) {
      const test = reading[role];
      if (!test) continue;
      const result = test(values[role]);
      if (result === undefined) {
        matches = false;
        break;
      }
      if (result === 1) unfinished = true;
    }
    if (!matches) continue;
    const whole = Boolean(reading.year && reading.month && reading.day);
    const rank =
      (whole ? 0 : 2) + (unfinished ? 1 : 0) + reading.preference / 10;
    if (best === undefined || rank < best) best = rank;
  }
  return best;
}

/** Whether a day — `YYYY-MM-DD` — answers a query typed as text. */
export function matchesDayQuery(date: string, query: string): boolean {
  const parsed = parseDayQuery(query);
  return parsed !== undefined && dayQueryRank(date, parsed) !== undefined;
}

const MONTH_FORMS: string[][] = Array.from({ length: 12 }, (_, index) =>
  Object.values(dateWords).flatMap(({ months }) => [...(months[index] ?? [])]),
);
const FILLERS = new Set(
  Object.values(dateWords).flatMap(({ fillers }) => fillers),
);

/**
 * A word that begins the name of a month: three letters at least, which is
 * how a month is cut short; an unfinished word after a number may be shorter,
 * since what is being typed after `12` is most likely its month.
 */
function monthPart(
  word: string,
  open: boolean,
  afterNumber: boolean,
): DayPart | undefined {
  if (word.length < 3 && !(open && afterNumber)) return undefined;
  const months = new Set<number>();
  let whole = false;
  MONTH_FORMS.forEach((forms, index) => {
    for (const form of forms) {
      if (!form.startsWith(word)) continue;
      months.add(index + 1);
      if (form === word) whole = true;
    }
  });
  if (!months.size) return undefined;
  const result = open && !whole ? 1 : 0;
  return {
    kind: 'month',
    test: (value) => (months.has(value) ? result : undefined),
  };
}

/** A word that goes with a day, or the start of one still being typed. */
function isFiller(word: string, open: boolean) {
  if (FILLERS.has(word)) return true;
  return open && [...FILLERS].some((filler) => filler.startsWith(word));
}

/**
 * What a number can say as one part of a day. A year is written in full; an
 * unfinished one may be its start, and of three parts, two digits are its end
 * (`12.05.24`). A month or a day is a number of one or two digits in range;
 * an unfinished one also matches what it begins — `1` as a month is January
 * or any of the last three, `0` any of the first nine.
 */
function numberTest(
  part: Extract<DayPart, { kind: 'number' }>,
  role: Role,
  threeParts: boolean,
): ValueTest | undefined {
  const { digits, open } = part;
  const number = Number(digits);
  if (role === 'year') {
    if (digits.length === 4)
      return (value) => (value === number ? 0 : undefined);
    const shortYear = threeParts && digits.length === 2;
    if (!open && !shortYear) return undefined;
    return (value) =>
      shortYear && value % 100 === number
        ? 0
        : open && String(value).startsWith(digits)
          ? 1
          : undefined;
  }
  if (digits.length > 2) return undefined;
  const max = role === 'month' ? 12 : 31;
  const test: ValueTest = (value) =>
    value === number
      ? 0
      : open &&
          (String(value).startsWith(digits) ||
            String(value).padStart(2, '0').startsWith(digits))
        ? 1
        : undefined;
  for (let value = 1; value <= max; value++)
    if (test(value) !== undefined) return test;
  return undefined;
}

/** Every ordered choice of `count` distinct roles. */
function arrangements(roles: Role[], count: number): Role[][] {
  if (!count) return [[]];
  return roles.flatMap((role) =>
    arrangements(
      roles.filter((other) => other !== role),
      count - 1,
    ).map((rest) => [role, ...rest]),
  );
}
