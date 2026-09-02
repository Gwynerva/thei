import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import { sendContextAsset } from '../../../../thei/assets/context-access';

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? '';
  const entity = await THEI_SERVER.projects.findByPublicId(
    publicIdFromProjectUrlPart(slug),
  );
  if (!entity) throw createError({ statusCode: 404 });

  return sendContextAsset(event, {
    ownerType: 'project',
    ownerId: entity.projectUuid,
    access: entity.access,
    role: 'content',
    filename: getRouterParam(event, 'filename') ?? '',
  });
});
