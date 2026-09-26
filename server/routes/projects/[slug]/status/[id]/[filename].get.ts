import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import { sendContextAsset } from '../../../../../thei/assets/context-access';
import { projectStatusExists } from '../../../../../thei/statuses';

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? '';
  const entity = await THEI_SERVER.projects.findByPublicId(
    publicIdFromProjectUrlPart(slug),
  );
  if (!entity) throw createError({ statusCode: 404 });
  const id = getRouterParam(event, 'id') ?? '';
  // The address judges the status by this project's access, so the status
  // has to be this project's own.
  if (!id || !projectStatusExists(entity.projectUuid, id))
    throw createError({ statusCode: 404 });
  return sendContextAsset(event, {
    ownerType: 'project-status',
    ownerId: id,
    // A status is as visible as the project it belongs to, and opens with the
    // project's share link.
    access: entity.access,
    grantOwner: { entityType: 'project', entityId: entity.projectUuid },
    role: 'icon',
    filename: getRouterParam(event, 'filename') ?? '',
  });
});
