import type { AiMemoryIndex } from '#layers/thei/shared/ai-memory';
import { requireAiOn } from '../../../../thei/ai-on';
import { memoryIndex } from '../../../../thei/ai/memory/index';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/** The Memory tab: «about you», the dictionary, kinds and entities. */
export default defineEventHandler(async (event): Promise<AiMemoryIndex> => {
  requireAiOn();
  markReadOnlyRequest(event);
  const query = getQuery(event);
  return memoryIndex({
    q: typeof query.q === 'string' ? query.q : undefined,
    offset: Number(query.offset) || 0,
  });
});
