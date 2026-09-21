import { revokeShareLink } from '../../../thei/access-links/share-links';

export default defineEventHandler((event) => {
  const shareUuid = getRouterParam(event, 'shareUuid') ?? '';
  if (!revokeShareLink(shareUuid)) throw createError({ statusCode: 404 });
  return { ok: true };
});
