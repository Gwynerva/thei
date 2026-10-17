import type { AiTextReviews } from '#layers/thei/shared/ai';
import { requireAiOn } from '../../../../thei/ai-on';
import { actionsAbout } from '../../../../thei/ai/actions/rows';
import { waitingOffers } from '../../../../thei/ai/entity-panel';
import { entityTextOfSlot, findEntity } from '../../../../thei/entity-kinds';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/**
 * The text edits waiting for one text, by its owner and slot: what its editor
 * offers to go through. They are the form's own proposals for the text —
 * what the text has overtaken since settled first, none of a session in the
 * archive, none the owner said never to offer — but for one of an atomic
 * bundle, which goes whole from its session.
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
      !(row.atomic && row.bundleUuid) &&
      (row.payload as { text?: string }).text === text.name,
  );
  const offers = await waitingOffers(rows, () => `text:${text.slot}`);
  return { actions: offers.map((offer) => offer.action) };
});
