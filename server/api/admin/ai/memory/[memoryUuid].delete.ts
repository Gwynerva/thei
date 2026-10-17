import { requireAiOn } from '../../../../thei/ai-on';
import { withRefusals } from '../../../../thei/ai/refusals';
import { refuse as fail } from '../../../../thei/entity-patch/text';
import { deleteMemory, findMemory } from '../../../../thei/ai/memory/store';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/** The owner lets a record go: a fact, or a «never» no longer meant. */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    const memoryUuid = getRouterParam(event, 'memoryUuid') ?? '';
    if (!findMemory(memoryUuid)) fail('There is no such record.');
    deleteMemory([memoryUuid]);
    return { ok: true };
  }),
);
