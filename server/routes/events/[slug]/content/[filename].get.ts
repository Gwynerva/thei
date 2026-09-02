import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { sendContextAsset } from '../../../../thei/assets/context-access';

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? '';
  const entity = await THEI_SERVER.events.findByPublicId(
    publicIdFromEventUrlPart(slug),
  );
  if (!entity) throw createError({ statusCode: 404 });

  return sendContextAsset(event, {
    ownerType: 'event',
    ownerId: entity.eventUuid,
    access: entity.access,
    role: 'content',
    filename: getRouterParam(event, 'filename') ?? '',
  });
});
