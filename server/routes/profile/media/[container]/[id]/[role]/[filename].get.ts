import { sendContextAsset } from '../../../../../../thei/assets/context-access';
export default defineEventHandler((event) => {
  const { container, id, role, filename } = event.context.params!;
  if (
    !id ||
    !filename ||
    !['profile', 'profile-avatar', 'profile-status'].includes(
      container ?? '',
    ) ||
    !['icon', 'banner', 'favicon', 'content'].includes(role ?? '')
  )
    throw createError({ statusCode: 404 });
  return sendContextAsset(event, {
    ownerType: container as 'profile' | 'profile-avatar' | 'profile-status',
    ownerId: id,
    role: role as 'icon' | 'banner' | 'favicon' | 'content',
    filename,
  });
});
