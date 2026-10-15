import type { AiTermItem } from '#layers/thei/shared/ai-memory';
import { requireAiOn } from '../../../../thei/ai-on';
import { withRefusals } from '../../../../thei/ai/refusals';
import { saveTerm, termItems } from '../../../../thei/ai/terms';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/** The owner changes a word of the dictionary, its spelling included. */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<AiTermItem> => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<Record<string, unknown>>(event)) ?? {};
    const word = decodeURIComponent(getRouterParam(event, 'word') ?? '');
    return termItems([
      saveTerm(
        {
          display: body.display,
          note: body.note,
          forms: body.forms,
          keep: body.keep,
        },
        word,
      ),
    ])[0]!;
  }),
);
