import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { rejectActions } from '../../../../../thei/ai/actions/decide';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/** The owner declines an action — or says never to offer it again. */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<{ never?: unknown }>(event)) ?? {};
    rejectActions([getRouterParam(event, 'actionUuid') ?? ''], {
      never: body.never === true,
    });
    return { ok: true };
  }),
);
