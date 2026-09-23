import { asc } from 'drizzle-orm';

/**
 * Every day that already holds an entry.
 *
 * The form asks for this once and then knows, without a round trip per
 * keystroke, that a chosen day is occupied — and which entry to open instead
 * of writing a second one for the same day.
 */
export default defineEventHandler(
  async (): Promise<Array<{ date: string; diaryUuid: string }>> => {
    const { db, schema } = THEI_SERVER.useDb();
    return db
      .select({
        date: schema.diaryEntries.date,
        diaryUuid: schema.diaryEntries.diaryUuid,
      })
      .from(schema.diaryEntries)
      .orderBy(asc(schema.diaryEntries.date))
      .all();
  },
);
