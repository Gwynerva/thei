import type { AiTermItem } from '#layers/thei/shared/ai-memory';
import { requireAiOn } from '../../../../thei/ai-on';
import { withRefusals } from '../../../../thei/ai/refusals';
import { saveTerm, termItems } from '../../../../thei/ai/terms';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/** The owner adds a word to the dictionary. */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<AiTermItem> => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<Record<string, unknown>>(event)) ?? {};
    return termItems([
      saveTerm({
        display: body.display,
        note: body.note,
        forms: body.forms,
        keep: body.keep,
      }),
    ])[0]!;
  }),
);
