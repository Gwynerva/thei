import { requireAiOn } from '../../../../thei/ai-on';
import { startOwnerSession } from '../../../../thei/ai/sessions/owner';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/**
 * Starts a session of the owner's: about what they name, with their first
 * words and the files they bring, which the model answers at once.
 */
export default defineEventHandler(async (event) => {
  requireAiOn();
  markReadOnlyRequest(event);
  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const sessionUuid = startOwnerSession({
    title: typeof body.title === 'string' ? body.title : undefined,
    about: body.about,
    text: typeof body.text === 'string' ? body.text : undefined,
    files: body.files,
  });
  return { sessionUuid };
});
