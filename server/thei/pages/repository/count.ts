export async function countPages() {
  const { db, schema } = THEI_SERVER.useDb();
  return db.$count(schema.pages);
}
