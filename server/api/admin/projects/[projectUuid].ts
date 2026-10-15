import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import { formVersion } from '../../../thei/entity-edit';
import {
  deleteProject,
  readProjectEdit,
  saveProjectEdit,
} from '../../../thei/projects/edit';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'projectUuid')!;
  const project =
    (await THEI_SERVER.projects.findByUuid(identifier)) ??
    (await THEI_SERVER.projects.findByPublicId(identifier));

  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }

  switch (event.method) {
    case 'GET':
      return readProjectEdit(project);
    case 'PUT': {
      const body = await readBody<ProjectEditData>(event);
      return saveProjectEdit(project.projectUuid, body, {
        expectedUpdatedAt: formVersion(body),
      });
    }
    case 'DELETE':
      await deleteProject(project.projectUuid);
      return;
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
