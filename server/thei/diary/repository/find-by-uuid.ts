import { eq } from 'drizzle-orm';

export async function findDiaryEntryByUuid(diaryUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return await db.query.diaryEntries.findFirst({
    where: eq(schema.diaryEntries.diaryUuid, diaryUuid),
  });
}
