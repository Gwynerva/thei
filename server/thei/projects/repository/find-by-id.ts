import { eq } from 'drizzle-orm';

export async function findProjectByUuid(projectUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.query.projects.findFirst({
    where: eq(schema.projects.projectUuid, projectUuid),
  });
}
