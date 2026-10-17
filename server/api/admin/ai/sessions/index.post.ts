import { requireAiOn } from '../../../../thei/ai-on';
import { startOwnerSession } from '../../../../thei/ai/sessions/owner';
import { chosenModel } from '../../../../thei/ai/model/settings';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';
import { rememberOrigin } from '../../../../thei/ai/runner/background-event';

/**
 * Starts a session of the owner's: about what they name, with their first
 * words and the files they bring, which the model answers at once — words
 * that may have begun as a template's, which the session then remembers —
 * and answers with the model chosen for it, or the connection's.
 */
export default defineEventHandler(async (event) => {
  requireAiOn();
  markReadOnlyRequest(event);
  // The turn this asks for writes addresses where the owner is.
  rememberOrigin(event);
  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const sessionUuid = startOwnerSession({
    title: typeof body.title === 'string' ? body.title : undefined,
    about: body.about,
    text: typeof body.text === 'string' ? body.text : undefined,
    files: body.files,
    templateId: body.templateId,
    model: chosenModel(body.model) ?? undefined,
  });
  return { sessionUuid };
});
