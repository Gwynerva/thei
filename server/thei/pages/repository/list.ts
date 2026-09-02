import { desc } from 'drizzle-orm';

export async function listPages(offset: number, limit: number) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.pages)
    .orderBy(desc(schema.pages.updatedAt), desc(schema.pages.createdAt))
    .limit(limit)
    .offset(offset);
}
