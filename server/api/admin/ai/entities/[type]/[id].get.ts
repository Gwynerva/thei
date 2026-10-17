import type { AiEntityPanel } from '#layers/thei/shared/ai-entity';
import { requireAiOn } from '../../../../../thei/ai-on';
import { findEntity } from '../../../../../thei/entity-kinds';
import { entityPanel } from '../../../../../thei/ai/entity-panel';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * What an entity's form shows of the AI: its memory and digest, what is kept
 * of its parts, the proposals that wait for it, the sessions about it.
 */
export default defineEventHandler(async (event): Promise<AiEntityPanel> => {
  requireAiOn();
  markReadOnlyRequest(event);
  const key = findEntity(
    `${getRouterParam(event, 'type')}:${getRouterParam(event, 'id')}`,
  );
  if (!key) throw createError({ statusCode: 404 });
  return entityPanel(key);
});
