import { partDecisions } from '#layers/thei/shared/ai-actions';
import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { markTakenInEditor } from '../../../../../thei/ai/actions/apply';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * A text edit taken in the editor, now that its form is saved: the parts
 * taken are made, those left kept as they were. The text itself went with
 * the form.
 */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<{ parts?: unknown }>(event)) ?? {};
    markTakenInEditor(
      getRouterParam(event, 'actionUuid') ?? '',
      partDecisions(body.parts, ['accepted', 'kept']),
    );
    return { ok: true };
  }),
);
