import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { findAction } from '../../../../../thei/ai/actions/rows';
import { postOwnerMessage } from '../../../../../thei/ai/sessions/owner';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * The owner's comment on an action: a message of its session tied to it,
 * which the model answers with a new version — or an app reads next time.
 */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    const actionUuid = getRouterParam(event, 'actionUuid') ?? '';
    const action = findAction(actionUuid);
    if (!action) throw createError({ statusCode: 404 });
    const body = (await readBody<{ text?: unknown }>(event)) ?? {};
    const messageUuid = postOwnerMessage(action.sessionUuid, {
      text: typeof body.text === 'string' ? body.text : '',
      comment: actionUuid,
    });
    return { messageUuid };
  }),
);
