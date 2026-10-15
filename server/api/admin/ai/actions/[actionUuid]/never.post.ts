import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { neverAgain, neverPart } from '../../../../../thei/ai/actions/decide';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * Never to offer an action again, declined already or not — or one
 * correction of a text edit, the word kept as written for good.
 */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<{ part?: unknown }>(event)) ?? {};
    const actionUuid = getRouterParam(event, 'actionUuid') ?? '';
    if (typeof body.part === 'string') neverPart(actionUuid, body.part);
    else neverAgain(actionUuid);
    return { ok: true };
  }),
);
