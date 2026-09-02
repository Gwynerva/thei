import { sendContextAsset } from '../../../../thei/assets/context-access';

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? '';
  const entity = await THEI_SERVER.pages.findBySlug(slug);
  if (!entity) throw createError({ statusCode: 404 });

  return sendContextAsset(event, {
    ownerType: 'page',
    ownerId: entity.pageUuid,
    access: entity.access,
    role: 'icon',
    filename: getRouterParam(event, 'filename') ?? '',
  });
});
