import { requireAiOn } from '../../../../thei/ai-on';
import { withRefusals } from '../../../../thei/ai/refusals';
import { deleteTerm } from '../../../../thei/ai/terms';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/** The owner takes a word out of the dictionary. */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    deleteTerm(decodeURIComponent(getRouterParam(event, 'word') ?? ''));
    return { ok: true };
  }),
);
