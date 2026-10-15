import type { ApiTokenActivityResponse } from '#layers/thei/shared/api-token';
import { listApiTokens } from '../../../thei/api-tokens';
import { listSessions } from '../../../thei/ai/sessions/view';

/** How much of a key's past its window shows. */
const RECENT = 15;

/**
 * One access key and what it did lately: its sessions, and how many of the
 * actions it proposed wait for the owner. The key's own window shows this,
 * beside checking it and revoking it.
 */
export default defineEventHandler((event): ApiTokenActivityResponse => {
  const tokenUuid = getRouterParam(event, 'tokenUuid') ?? '';
  const item = listApiTokens().find((token) => token.tokenUuid === tokenUuid);
  if (!item) throw createError({ statusCode: 404 });
  const { sessions } = listSessions({ tokenUuid });
  return {
    item,
    sessions: sessions.slice(0, RECENT),
    waiting: sessions.reduce((sum, session) => sum + session.waiting, 0),
  };
});
