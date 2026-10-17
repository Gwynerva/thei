import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { undoActionHeld } from '../../../../../thei/ai/actions/undo';
import { targetRef } from '../../../../../thei/ai/actions/target';
import { movedBy } from '../../../../../thei/ai/actions/apply';
import { findAction } from '../../../../../thei/ai/actions/rows';

/**
 * Takes back an applied action, while nothing has changed it since: the
 * entity it changed, and every other one whose version it moved back — a
 * section's project, a relation's other end — for open forms to read anew.
 */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    const actionUuid = getRouterParam(event, 'actionUuid') ?? '';
    const row = findAction(actionUuid);
    const entity = await undoActionHeld(actionUuid);
    return {
      entity: entity ? targetRef(entity) : undefined,
      changed: row ? movedBy(row) : [],
    };
  }),
);
