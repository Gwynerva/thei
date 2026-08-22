import { eq } from 'drizzle-orm';

export async function findEventByUuid(eventUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return await db.query.events.findFirst({
    where: eq(schema.events.eventUuid, eventUuid),
  });
}
