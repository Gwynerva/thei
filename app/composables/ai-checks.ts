import type { AiTemplateItem } from '#layers/thei/shared/ai-template';

/**
 * Runs a built-in check and says what came of it: the session it started —
 * handed to `started`, or opened from a toast — or, with nothing new to look
 * at, that there was nothing, the words put back with `restore`; run on
 * some entities, with a way to look at them again from the start. Resolves
 * to the session, if one started.
 */
export async function runAiCheck(
  check: Pick<AiTemplateItem, 'templateId' | 'title'>,
  options: {
    /** The entities it is about, by ref. */
    about?: string[];
    /** The owner's words it was sent with. */
    request?: string;
    force?: boolean;
    started?: (sessionUuid: string) => void;
    restore?: () => void;
  } = {},
): Promise<string | null> {
  const title = publicText(check.title);
  try {
    const { sessionUuid } = await aiApi.runCheck(check.templateId, {
      ...(options.about?.length ? { about: options.about } : {}),
      ...(options.request ? { request: options.request } : {}),
      ...(options.force ? { force: true } : {}),
    });
    if (sessionUuid) {
      if (options.started) options.started(sessionUuid);
      else
        showToast(phrase.value.ai_template_started(title), {
          label: phrase.value.ai_action_open,
          run: () => {
            void navigateTo({
              path: '/admin/ai/',
              query: { session: sessionUuid },
            });
          },
        });
      return sessionUuid;
    }
    options.restore?.();
    showToast(
      phrase.value.ai_template_nothing_new(title),
      options.about?.length
        ? {
            label: phrase.value.ai_template_run_again,
            run: () => {
              void runAiCheck(check, {
                ...options,
                force: true,
                restore: undefined,
              });
            },
          }
        : undefined,
    );
  } catch (caught) {
    options.restore?.();
    showToast(errorMessage(caught, phrase.value.ai_error));
  }
  return null;
}
