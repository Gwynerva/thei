import { eq } from 'drizzle-orm';

export async function findPageByUuid(pageUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.query.pages.findFirst({
    where: eq(schema.pages.pageUuid, pageUuid),
  });
}
