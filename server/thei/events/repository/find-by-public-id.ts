import { and, eq, ne } from 'drizzle-orm';

export async function findEventByPublicId(
  publicId: string,
  exceptEventUuid?: string,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return await db.query.events.findFirst({
    where: exceptEventUuid
      ? and(
          eq(schema.events.publicId, publicId),
          ne(schema.events.eventUuid, exceptEventUuid),
        )
      : eq(schema.events.publicId, publicId),
  });
}
