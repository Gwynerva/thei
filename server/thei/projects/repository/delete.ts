import { eq } from 'drizzle-orm';

export async function deleteProject(projectUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  await db
    .delete(schema.projects)
    .where(eq(schema.projects.projectUuid, projectUuid));
}
