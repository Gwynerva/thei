import type { PublicProjectSectionResponse } from '#layers/thei/shared/api/public';
import {
  publicIdFromProjectSectionUrlPart,
  publicIdFromProjectUrlPart,
} from '#layers/thei/shared/project-url';
import { getProjectSections } from '../../../../thei/projects/content-sections';
import {
  buildPublicProjectSection,
  canOpenPublicEntity,
} from '../../../../thei/public/entities';
import { buildProjectSectionNeighbours } from '../../../../thei/public/neighbours';
import { resolveEntityViewer } from '../../../../thei/access-links/viewer';

export default defineEventHandler(
  async (event): Promise<PublicProjectSectionResponse> => {
    const project = await THEI_SERVER.projects.findByPublicId(
      publicIdFromProjectUrlPart(getRouterParam(event, 'project') ?? ''),
    );
    if (!project)
      throw createError({ statusCode: 404, statusText: 'Project not found' });
    // A share link on the project covers its sections too.
    const viewer = await resolveEntityViewer(
      event,
      'project',
      project.projectUuid,
    );
    if (!canOpenPublicEntity(project.access, viewer.asOwner))
      throw createError({ statusCode: 404, statusText: 'Section not found' });
    const publicId = publicIdFromProjectSectionUrlPart(
      getRouterParam(event, 'section') ?? '',
    );
    const sections = await getProjectSections(project.projectUuid);
    const section = sections.find((item) => item.publicId === publicId);
    if (!section || (section.isPrivate && !viewer.asOwner))
      throw createError({ statusCode: 404, statusText: 'Section not found' });
    if (project.access === 'link-only')
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    const [response, neighbours] = await Promise.all([
      buildPublicProjectSection(project, section, viewer),
      buildProjectSectionNeighbours(project, sections, section, viewer.asOwner),
    ]);
    return { ...response, neighbours };
  },
);
