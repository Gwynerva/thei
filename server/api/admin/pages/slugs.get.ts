import { asc } from 'drizzle-orm';

export default defineEventHandler((): string[] => {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ slug: schema.pages.slug })
    .from(schema.pages)
    .orderBy(asc(schema.pages.slug))
    .all()
    .map(({ slug }) => slug);
});
