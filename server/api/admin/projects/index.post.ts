import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import { createProject } from '../../../thei/projects/create';

export default defineEventHandler(async (event) =>
  createProject(await readBody<ProjectEditData>(event)),
);
