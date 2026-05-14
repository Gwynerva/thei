export async function countEvents() {
  const { db, schema } = THEI_SERVER.useDb();
  return db.$count(schema.events);
}
