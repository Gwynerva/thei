import { partDecisions } from '#layers/thei/shared/ai-actions';
import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { markTakenInEditor } from '../../../../../thei/ai/actions/apply';
import { adoptTaken } from '../../../../../thei/ai/actions/edit';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * A proposal taken into a form, now that the form is saved. A text edit
 * taken in the editor: the parts taken are made, those left kept as they
 * were. Any other: `values`, its words as the saved form holds them — the
 * owner's, when they corrected the model's — which it counts as applied
 * with once the saved entity reads so. What went with the form is checked,
 * never taken on trust.
 */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    const actionUuid = getRouterParam(event, 'actionUuid') ?? '';
    const body =
      (await readBody<{ parts?: unknown; values?: unknown }>(event)) ?? {};
    if (body.values !== undefined) await adoptTaken(actionUuid, body.values);
    else
      markTakenInEditor(
        actionUuid,
        partDecisions(body.parts, ['accepted', 'kept']),
      );
    return { ok: true };
  }),
);
