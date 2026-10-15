import { partDecisions } from '#layers/thei/shared/ai-actions';
import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { decideParts } from '../../../../../thei/ai/actions/apply';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/** The owner's word on parts of an action, kept until it is applied. */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<{ parts?: unknown }>(event)) ?? {};
    return {
      parts: decideParts(
        getRouterParam(event, 'actionUuid') ?? '',
        partDecisions(body.parts),
      ),
    };
  }),
);
