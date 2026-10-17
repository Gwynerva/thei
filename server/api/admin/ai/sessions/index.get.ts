import {
  AI_SESSION_ORIGINS,
  type AiSessionListResponse,
  type AiSessionOrigin,
} from '#layers/thei/shared/ai';
import { requireAiOn } from '../../../../thei/ai-on';
import { findEntity } from '../../../../thei/entity-kinds';
import { listSessions } from '../../../../thei/ai/sessions/view';

/**
 * The owner's sessions, the latest first, a page at a time: by where they
 * came from, archived or not, waiting or not, by template, by an entity
 * they are about, and by words.
 */
export default defineEventHandler((event): AiSessionListResponse => {
  requireAiOn();
  const query = getQuery(event);
  const origin = AI_SESSION_ORIGINS.includes(query.origin as AiSessionOrigin)
    ? (query.origin as AiSessionOrigin)
    : undefined;
  const before = Number(query.before);
  return listSessions({
    origin,
    archived:
      query.archived === 'true'
        ? true
        : query.archived === 'false'
          ? false
          : undefined,
    waiting: query.waiting === 'true',
    applied: query.applied === 'true',
    rejected: query.rejected === 'true',
    templateId:
      typeof query.template === 'string'
        ? query.template.slice(0, 100)
        : undefined,
    about: findEntity(query.about),
    q: typeof query.q === 'string' ? query.q.slice(0, 200) : undefined,
    before: Number.isFinite(before) && before > 0 ? before : undefined,
  });
});
