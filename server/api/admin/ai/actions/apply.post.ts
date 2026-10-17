import {
  partDecisions,
  type AiRevisePartState,
} from '#layers/thei/shared/ai-actions';
import { requireAiOn } from '../../../../thei/ai-on';
import { withRefusals } from '../../../../thei/ai/refusals';
import { applyActions } from '../../../../thei/ai/actions/apply';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/**
 * The owner applies actions: one, or the ticked ones of a bundle, with
 * their word on each part. Applied, the entities they changed read anew.
 */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    const body = (await readBody<Record<string, unknown>>(event)) ?? {};
    const actionUuids = Array.isArray(body.actionUuids)
      ? body.actionUuids
          .filter((id): id is string => typeof id === 'string')
          .slice(0, 100)
      : [];
    if (!actionUuids.length) throw createError({ statusCode: 400 });
    const parts: Record<string, Record<string, AiRevisePartState>> = {};
    if (body.parts && typeof body.parts === 'object')
      for (const [actionUuid, decisions] of Object.entries(
        body.parts as Record<string, unknown>,
      ))
        parts[actionUuid] = partDecisions(decisions);
    const outcome = await applyActions({ actionUuids, by: 'owner', parts });
    // Nothing applied, nothing a visitor sees changed.
    if (!outcome.applied.length) markReadOnlyRequest(event);
    return outcome;
  }),
);
