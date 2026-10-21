import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { editAction } from '../../../../../thei/ai/actions/edit';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * The owner corrects the words of a proposal still waiting, before
 * applying it: `values` by text key, as the card lists them.
 */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<{ values?: unknown }>(event)) ?? {};
    await editAction(getRouterParam(event, 'actionUuid') ?? '', body.values);
    return { ok: true };
  }),
);
