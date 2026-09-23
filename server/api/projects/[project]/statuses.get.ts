import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import { resolveEntityViewer } from '../../../thei/access-links/viewer';
import { canOpenPublicEntity } from '../../../thei/public/entities';
import { getStatusHistory } from '../../../thei/statuses';

export default defineEventHandler(async (event) => {
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
  // A status history is exactly as visible as the project it belongs to.
  if (!canOpenPublicEntity(project.access, viewer.asOwner))
    throw createError({ statusCode: 404 });
  const cursor = getQuery(event).cursor;
  return getStatusHistory(
    { type: 'project', id: project.projectUuid },
    typeof cursor === 'string' ? cursor : undefined,
  );
});
