/**
 * A diary entry's day as it is stored, which is all it has for a name — and
 * what any part of that very shape is taken for.
 */
const STORED_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * A name put together of several — «what holds it · itself», «an entity ›
 * a heading in it» — as a reader names it: each part that is a diary
 * entry's day is written out by `day`, the others pass through `text`,
 * which formats the owner's words. For a name that comes as one string; one
 * that comes with its `date` apart needs no guessing.
 *
 * It is a guess by the part's shape alone: a title that is exactly a stored
 * day — an event the owner named «2026-04-06» — is written out as that day
 * too, since nothing in the string tells it from a diary entry.
 */
export function formatEntityPlaceName(
  name: string,
  day: (date: string) => string,
  text: (value: string) => string,
): string {
  return name
    .split(/( · | › )/u)
    .map((part, index) =>
      index % 2 ? part : STORED_DAY.test(part) ? day(part) : text(part),
    )
    .join('');
}
