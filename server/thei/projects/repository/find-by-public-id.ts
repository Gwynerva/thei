import { and, eq, ne } from 'drizzle-orm';

export async function findProjectByPublicId(
  publicId: string,
  excludeProjectUuid?: string,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.query.projects.findFirst({
    where: excludeProjectUuid
      ? and(
          eq(schema.projects.publicId, publicId),
          ne(schema.projects.projectUuid, excludeProjectUuid),
        )
      : eq(schema.projects.publicId, publicId),
  });
}
