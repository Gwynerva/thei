import { eq } from 'drizzle-orm';

/**
 * The entry written on a day, if there is one.
 *
 * A day holds at most one entry, so this is the whole of address resolution
 * for the diary: no public ID, no slug, no ambiguity to break.
 */
export async function findDiaryEntryByDate(date: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return await db.query.diaryEntries.findFirst({
    where: eq(schema.diaryEntries.date, date),
  });
}
