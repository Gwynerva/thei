import type { AiTemplateItem } from '#layers/thei/shared/ai-template';

/**
 * Runs a built-in check and says what came of it: the session it started —
 * handed to `started`, or opened from a toast — or, with nothing new to look
 * at, that there was nothing; run on one entity, with a way to look at it
 * again from the start. Resolves to the session, if one started.
 */
export async function runAiCheck(
  check: Pick<AiTemplateItem, 'templateId' | 'title'>,
  options: {
    /** One entity, by its ref. */
    about?: string;
    force?: boolean;
    started?: (sessionUuid: string) => void;
  } = {},
): Promise<string | null> {
  const title = publicText(check.title);
  try {
    const { sessionUuid } = await aiApi.runCheck(check.templateId, {
      ...(options.about ? { about: options.about } : {}),
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
    showToast(
      phrase.value.ai_template_nothing_new(title),
      options.about
        ? {
            label: phrase.value.ai_template_run_again,
            run: () => {
              void runAiCheck(check, { ...options, force: true });
            },
          }
        : undefined,
    );
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  }
  return null;
}
