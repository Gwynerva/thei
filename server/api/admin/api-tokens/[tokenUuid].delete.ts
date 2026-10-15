import { markReadOnlyRequest } from '../../../thei/read-only-request';
import { revokeApiToken } from '../../../thei/api-tokens';

export default defineEventHandler((event) => {
  markReadOnlyRequest(event);
  const tokenUuid = getRouterParam(event, 'tokenUuid') ?? '';
  if (!revokeApiToken(tokenUuid)) throw createError({ statusCode: 404 });
  return { ok: true };
});
