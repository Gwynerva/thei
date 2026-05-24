import { eq } from 'drizzle-orm';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

export interface UpdateProjectData {
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  important: boolean;
  cv: boolean;
}

export async function updateProject(
  projectUuid: string,
  data: UpdateProjectData,
) {
  const { db, schema } = THEI_SERVER.useDb();
  await db
    .update(schema.projects)
    .set(data)
    .where(eq(schema.projects.projectUuid, projectUuid));
}
