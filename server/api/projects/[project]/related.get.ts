import type { PublicRelatedPage } from '#layers/thei/shared/api/public';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import { resolveEntityViewer } from '../../../thei/access-links/viewer';
import { canOpenPublicEntity } from '../../../thei/public/entities';
import {
  buildPublicRelatedPage,
  readPublicRelatedQuery,
} from '../../../thei/public/related';

export default defineEventHandler(async (event): Promise<PublicRelatedPage> => {
  const identifier = getRouterParam(event, 'project') ?? '';
  const project =
    (await THEI_SERVER.projects.findByUuid(identifier)) ??
    (await THEI_SERVER.projects.findByPublicId(
      publicIdFromProjectUrlPart(identifier),
    ));
  if (!project) throw createError({ statusCode: 404 });
  const viewer = await resolveEntityViewer(
    event,
    'project',
    project.projectUuid,
  );
  if (!canOpenPublicEntity(project.access, viewer.asOwner))
    throw createError({ statusCode: 404 });
  const { kind, page } = readPublicRelatedQuery(event);
  // Built for the visitor the reader really is: a share link opens this
  // project, not what is around it.
  return buildPublicRelatedPage(
    { type: 'project', id: project.projectUuid },
    kind,
    page,
    viewer.isAdmin,
  );
});
