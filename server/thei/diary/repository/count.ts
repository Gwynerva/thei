export async function countDiaryEntries() {
  const { db, schema } = THEI_SERVER.useDb();
  return db.$count(schema.diaryEntries);
}
