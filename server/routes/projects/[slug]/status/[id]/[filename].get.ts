import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import { sendContextAsset } from '../../../../../thei/assets/context-access';

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? '';
  const entity = await THEI_SERVER.projects.findByPublicId(
    publicIdFromProjectUrlPart(slug),
  );
  if (!entity) throw createError({ statusCode: 404 });
  const id = getRouterParam(event, 'id') ?? '';
  if (!id) throw createError({ statusCode: 404 });
  return sendContextAsset(event, {
    ownerType: 'project-status',
    ownerId: id,
    // A status is as visible as the project it belongs to.
    access: entity.access,
    role: 'icon',
    filename: getRouterParam(event, 'filename') ?? '',
  });
});
