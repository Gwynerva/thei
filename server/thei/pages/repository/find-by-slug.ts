import { and, eq, ne } from 'drizzle-orm';

export async function findPageBySlug(slug: string, exceptPageUuid?: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.query.pages.findFirst({
    where: exceptPageUuid
      ? and(
          eq(schema.pages.slug, slug),
          ne(schema.pages.pageUuid, exceptPageUuid),
        )
      : eq(schema.pages.slug, slug),
  });
}
