import type { PublicProjectSectionResponse } from '#layers/thei/shared/api/public';
import {
  publicIdFromProjectChildUrlPart,
  publicIdFromProjectUrlPart,
} from '#layers/thei/shared/project-url';
import { getProjectContentSections } from '../../../../thei/projects/content-sections';
import {
  buildPublicProjectSection,
  canOpenPublicEntity,
} from '../../../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PublicProjectSectionResponse> => {
    const project = await THEI_SERVER.projects.findByPublicId(
      publicIdFromProjectUrlPart(getRouterParam(event, 'project') ?? ''),
    );
    if (!project)
      throw createError({ statusCode: 404, statusText: 'Project not found' });
    const isAdmin = await THEI_SERVER.isAdmin(event);
    if (!canOpenPublicEntity(project.access, isAdmin))
      throw createError({ statusCode: 404, statusText: 'Section not found' });
    const publicId = publicIdFromProjectChildUrlPart(
      getRouterParam(event, 'section') ?? '',
    );
    const section = (await getProjectContentSections(project.projectUuid)).find(
      (item) => item.publicId === publicId,
    );
    if (!section || (section.isPrivate && !isAdmin))
      throw createError({ statusCode: 404, statusText: 'Section not found' });
    if (project.access === 'link-only')
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    return buildPublicProjectSection(project, section, isAdmin);
  },
);
