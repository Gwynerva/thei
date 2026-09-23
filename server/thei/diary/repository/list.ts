import { desc } from 'drizzle-orm';

export async function listDiaryEntries(offset: number, limit: number) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.diaryEntries)
    .orderBy(desc(schema.diaryEntries.date))
    .limit(limit)
    .offset(offset);
}
