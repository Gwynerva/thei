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
import { resolveEntityViewer } from '../../../../thei/access-links/viewer';
import { markSharedResponse } from '../../../../thei/access-links/response';

export default defineEventHandler(
  async (event): Promise<PublicProjectSectionResponse> => {
    const project = await THEI_SERVER.projects.findByPublicId(
      publicIdFromProjectUrlPart(getRouterParam(event, 'project') ?? ''),
    );
    if (!project)
      throw createError({ statusCode: 404, statusText: 'Project not found' });
    // A share link on the project covers its stages and sections too.
    const viewer = await resolveEntityViewer(
      event,
      'project',
      project.projectUuid,
    );
    if (!canOpenPublicEntity(project.access, viewer.asOwner))
      throw createError({ statusCode: 404, statusText: 'Section not found' });
    const publicId = publicIdFromProjectChildUrlPart(
      getRouterParam(event, 'section') ?? '',
    );
    const section = (await getProjectContentSections(project.projectUuid)).find(
      (item) => item.publicId === publicId,
    );
    if (!section || (section.isPrivate && !viewer.asOwner))
      throw createError({ statusCode: 404, statusText: 'Section not found' });
    if (project.access === 'link-only' || viewer.viaShare)
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    if (viewer.viaShare) markSharedResponse(event);
    return buildPublicProjectSection(project, section, viewer.asOwner);
  },
);
