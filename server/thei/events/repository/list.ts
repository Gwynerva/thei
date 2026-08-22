import { desc } from 'drizzle-orm';

export async function listEvents(offset: number, limit: number) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.events)
    .orderBy(desc(schema.events.updatedAt))
    .limit(limit)
    .offset(offset);
}
