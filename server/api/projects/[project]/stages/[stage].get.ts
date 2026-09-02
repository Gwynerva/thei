import type { PublicProjectStageResponse } from '#layers/thei/shared/api/public';
import {
  publicIdFromProjectChildUrlPart,
  publicIdFromProjectUrlPart,
} from '#layers/thei/shared/project-url';
import { getProjectStages } from '../../../../thei/projects/stages';
import {
  buildPublicProjectStage,
  canOpenPublicEntity,
} from '../../../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PublicProjectStageResponse> => {
    const project = await THEI_SERVER.projects.findByPublicId(
      publicIdFromProjectUrlPart(getRouterParam(event, 'project') ?? ''),
    );
    if (!project)
      throw createError({ statusCode: 404, statusText: 'Project not found' });
    const isAdmin = await THEI_SERVER.isAdmin(event);
    if (!canOpenPublicEntity(project.access, isAdmin))
      throw createError({ statusCode: 404, statusText: 'Stage not found' });
    const publicId = publicIdFromProjectChildUrlPart(
      getRouterParam(event, 'stage') ?? '',
    );
    const stage = (await getProjectStages(project.projectUuid)).find(
      (item) => item.publicId === publicId,
    );
    if (!stage || (stage.isPrivate && !isAdmin))
      throw createError({ statusCode: 404, statusText: 'Stage not found' });
    if (project.access === 'link-only')
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    return buildPublicProjectStage(project, stage, isAdmin);
  },
);
