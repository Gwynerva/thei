import type { AiReviewText } from '#layers/thei/shared/ai';
import { requireAiOn } from '../../../../../thei/ai-on';
import { findAction } from '../../../../../thei/ai/actions/rows';
import { actionItems } from '../../../../../thei/ai/sessions/view';
import {
  findSession,
  sessionName,
} from '../../../../../thei/ai/sessions/store';
import { buildContentFieldValue } from '../../../../../thei/content/repository';
import { entityText, findEntity } from '../../../../../thei/entity-kinds';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * A text edit with the text it is about as the editor reads it — its files
 * and links filled in — for the screen it is gone through on.
 */
export default defineEventHandler(async (event): Promise<AiReviewText> => {
  requireAiOn();
  markReadOnlyRequest(event);
  const row = findAction(getRouterParam(event, 'actionUuid') ?? '');
  if (!row || row.kind !== 'revise' || !row.targetType || !row.targetId)
    throw createError({ statusCode: 404 });
  const key = findEntity(`${row.targetType}:${row.targetId}`);
  const text = key
    ? entityText(key.kind, (row.payload as { text?: string }).text)
    : undefined;
  if (!key || !text) throw createError({ statusCode: 404 });
  const field = await buildContentFieldValue(
    key.kind as never,
    key.id,
    text.slot,
  );
  const session = findSession(row.sessionUuid);
  const [action] = await actionItems([row]);
  return {
    action: action!,
    data: field?.data ?? { blocks: [] },
    ...(session
      ? {
          session: {
            sessionUuid: session.sessionUuid,
            // An app's session goes by the app's name until it has a title.
            title: sessionName(session),
          },
        }
      : {}),
  };
});
