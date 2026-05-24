import { desc } from 'drizzle-orm';

export async function listProjects(offset: number, limit: number) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.projects)
    .orderBy(desc(schema.projects.updatedAt))
    .limit(limit)
    .offset(offset);
}
