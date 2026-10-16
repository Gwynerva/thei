import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { undoActionHeld } from '../../../../../thei/ai/actions/undo';
import { targetRef } from '../../../../../thei/ai/actions/target';

/** Takes back an applied action, while nothing has changed it since. */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    const entity = await undoActionHeld(
      getRouterParam(event, 'actionUuid') ?? '',
    );
    return { entity: entity ? targetRef(entity) : undefined };
  }),
);
