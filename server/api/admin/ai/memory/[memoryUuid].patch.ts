import type { AiMemoryItem } from '#layers/thei/shared/ai-memory';
import { requireAiOn } from '../../../../thei/ai-on';
import { withRefusals } from '../../../../thei/ai/refusals';
import { memoryItem, updateMemory } from '../../../../thei/ai/memory/store';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/** The owner says a record anew. */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<AiMemoryItem> => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<{ text?: unknown }>(event)) ?? {};
    return memoryItem(
      updateMemory(getRouterParam(event, 'memoryUuid') ?? '', body.text),
    );
  }),
);
