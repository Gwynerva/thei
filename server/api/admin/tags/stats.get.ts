import { sql } from 'drizzle-orm';

export default defineEventHandler(() => {
  const { db, schema } = THEI_SERVER.useDb();
  return {
    count: Number(db.select({ count: sql<number>`count(*)` }).from(schema.tags).get()?.count ?? 0),
  };
});
