import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { continueRun } from '../../../../../thei/ai/templates/run';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';
import { rememberOrigin } from '../../../../../thei/ai/runner/background-event';

/**
 * The owner goes on with a check's run from its «go on»: the next batch of
 * the same. `messageUuid` is null when nothing is due any more.
 */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    // The turn this asks for writes addresses where the owner is.
    rememberOrigin(event);
    return continueRun(getRouterParam(event, 'sessionUuid') ?? '');
  }),
);
