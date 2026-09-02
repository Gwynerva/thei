import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { ASSET_ROLES, type AssetRole } from '#layers/thei/shared/asset';
import { sendContextAsset } from '../../../../thei/assets/context-access';

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? '';
  const entity = await THEI_SERVER.events.findByPublicId(
    publicIdFromEventUrlPart(slug),
  );
  if (!entity) throw createError({ statusCode: 404 });
  const role = getRouterParam(event, 'role') ?? '';
  if (!ASSET_ROLES.includes(role as AssetRole) || role === 'content')
    throw createError({ statusCode: 404 });
  return sendContextAsset(event, {
    ownerType: 'event',
    ownerId: entity.eventUuid,
    access: entity.access,
    role: role as AssetRole,
    filename: getRouterParam(event, 'filename') ?? '',
  });
});
