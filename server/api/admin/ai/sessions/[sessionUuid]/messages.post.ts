import { requireAiOn } from '../../../../../thei/ai-on';
import { postOwnerMessage } from '../../../../../thei/ai/sessions/owner';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';
import { rememberOrigin } from '../../../../../thei/ai/runner/background-event';

/**
 * The owner writes in a session — a message, an answer to the model's
 * question — and the model answers, where it answers.
 */
export default defineEventHandler(async (event) => {
  requireAiOn();
  markReadOnlyRequest(event);
  // The turn this asks for writes addresses where the owner is.
  rememberOrigin(event);
  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const messageUuid = postOwnerMessage(
    getRouterParam(event, 'sessionUuid') ?? '',
    {
      text: typeof body.text === 'string' ? body.text : '',
      about: body.about,
      files: body.files,
      answers: typeof body.answers === 'string' ? body.answers : undefined,
    },
  );
  return { messageUuid };
});
