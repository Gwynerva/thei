import type { AiMemoryItem } from '#layers/thei/shared/ai-memory';
import { requireAiOn } from '../../../../thei/ai-on';
import { withRefusals } from '../../../../thei/ai/refusals';
import { refuse as fail } from '../../../../thei/entity-patch/text';
import { findEntity } from '../../../../thei/entity-kinds';
import {
  addMemory,
  findMemory,
  isMemoryKind,
  memoryItem,
  type MemoryAnchor,
} from '../../../../thei/ai/memory/store';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/**
 * The owner remembers something by hand: about an entity, a pair of them, or
 * every entity of a kind — a fact, or something never to be offered.
 */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<AiMemoryItem> => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body =
      (await readBody<{
        anchor?: unknown;
        ref?: unknown;
        other?: unknown;
        kind?: unknown;
        type?: unknown;
        text?: unknown;
      }>(event)) ?? {};
    const entity = () =>
      findEntity(body.ref) ?? fail('There is no such entity.');
    let anchor: MemoryAnchor;
    switch (body.anchor) {
      case 'entity':
        anchor = { anchor: 'entity', entity: entity() };
        break;
      case 'pair':
        anchor = {
          anchor: 'pair',
          entity: entity(),
          other: findEntity(body.other) ?? fail('There is no such entity.'),
        };
        break;
      case 'kind':
        if (!isMemoryKind(body.kind)) fail('There is no such kind.');
        anchor = { anchor: 'kind', kind: body.kind };
        break;
      default:
        fail('Say what it is about.');
    }
    const memoryUuid = addMemory(anchor, {
      type: body.type === 'never' ? 'never' : 'fact',
      text: body.text,
    });
    return memoryItem(findMemory(memoryUuid)!);
  }),
);
