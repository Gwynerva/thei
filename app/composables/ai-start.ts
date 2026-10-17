import type { AiComposerFile } from './ai-session';
import type { AiPresetItem } from '#layers/thei/shared/ai-template';

/**
 * Starts a session from a message written in a composer, as both the AI
 * page and an entity's ✦ do. A built-in check chosen as the ready-made
 * request runs over what the message is about, narrowed by its words; any
 * other message starts a session of its own. `started` hears of the session
 * — also when a check is run again from its toast. A failure puts the words
 * back and says why.
 */
export async function startAiSession(
  message: {
    text: string;
    /** The entities it is about, by ref. */
    about: string[];
    files: AiComposerFile[];
    /** Puts the words back into the composer. */
    restore: () => void;
    /** The ready-made request the words began from. */
    templateId: string | undefined;
  },
  options: {
    /** The ready-made requests offered, the built-in checks among them. */
    presets: readonly AiPresetItem[];
    started: (sessionUuid: string) => void | Promise<void>;
  },
): Promise<void> {
  const check = options.presets.find(
    (item) => item.templateId === message.templateId && item.builtin,
  );
  if (check) {
    await runAiCheck(check, {
      about: message.about,
      request: message.text,
      restore: message.restore,
      started: (sessionUuid) => void options.started(sessionUuid),
    });
    return;
  }
  try {
    const { sessionUuid } = await aiApi.start({
      text: message.text,
      files: message.files,
      about: message.about,
      templateId: message.templateId,
    });
    await options.started(sessionUuid);
  } catch (caught) {
    message.restore();
    showToast(errorMessage(caught, phrase.value.ai_error));
  }
}
