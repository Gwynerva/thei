import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { restoreActions } from '../../../../../thei/ai/actions/decide';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/** Brings a declined action back, unless the archive moved on since. */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    const [row] = await restoreActions([
      getRouterParam(event, 'actionUuid') ?? '',
    ]);
    return { state: row?.state };
  }),
);
