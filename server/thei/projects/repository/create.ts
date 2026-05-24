import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

export interface CreateProjectData {
  projectUuid: string;
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  important: boolean;
  cv: boolean;
}

export async function createProject(data: CreateProjectData) {
  const { db, schema } = THEI_SERVER.useDb();
  const now = Date.now();
  await db
    .insert(schema.projects)
    .values({ ...data, createdAt: now, updatedAt: now });
}
