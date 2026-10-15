import type { AiTextReviews } from '#layers/thei/shared/ai';
import { requireAiOn } from '../../../../thei/ai-on';
import { actionsAbout } from '../../../../thei/ai/actions/rows';
import { settleActions } from '../../../../thei/ai/actions/apply';
import { actionItems } from '../../../../thei/ai/sessions/view';
import { entityTextOfSlot, findEntity } from '../../../../thei/entity-kinds';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/**
 * The text edits waiting for one text, by its owner and slot: what its editor
 * offers to go through.
 */
export default defineEventHandler(async (event): Promise<AiTextReviews> => {
  requireAiOn();
  markReadOnlyRequest(event);
  const query = getQuery(event);
  const key = findEntity(`${query.ownerType}:${query.ownerId}`);
  const text = key ? entityTextOfSlot(key.kind, query.slot) : undefined;
  if (!key || !text) return { actions: [] };
  const rows = actionsAbout(key, ['pending']).filter(
    (row) =>
      row.kind === 'revise' &&
      (row.payload as { text?: string }).text === text.name,
  );
  // What the text has overtaken since — saved with the edit in it — settles
  // first, so only what still waits is offered.
  const settled = await settleActions(rows);
  return {
    actions: await actionItems(
      settled.filter((row) => row.state === 'pending'),
    ),
  };
});
