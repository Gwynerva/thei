/**
 * What a new entity is begun with when the quick search began it: the
 * query as the title of a project, an event or a page (`?title=`), the day
 * a diary entry is for (`?date=`). Laid into the form as if typed, so the
 * form counts it as a change to save.
 */
export function titleFromQuery(): string {
  const value = useRoute().query.title;
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

export function dateFromQuery(): string | undefined {
  const value = useRoute().query.date;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? value
    : undefined;
}
