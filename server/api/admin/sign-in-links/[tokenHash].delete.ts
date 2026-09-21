import { revokeSignInLink } from '../../../thei/access-links/sign-in-links';

export default defineEventHandler((event) => {
  const tokenHash = getRouterParam(event, 'tokenHash') ?? '';
  if (!revokeSignInLink(tokenHash))
    throw createError({ statusCode: 404, message: 'Link not found' });
  return { ok: true };
});
