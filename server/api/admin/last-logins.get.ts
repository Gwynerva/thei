import { desc } from 'drizzle-orm';

export default defineEventHandler(async () => {
  const { db, schema } = THEI_SERVER.useDb();

  const logins = await db
    .select()
    .from(schema.signIns)
    .orderBy(desc(schema.signIns.at))
    .limit(10);

  return { logins };
});
