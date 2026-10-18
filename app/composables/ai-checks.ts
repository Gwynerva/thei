import type { AiTemplateItem } from '#layers/thei/shared/ai-template';

/**
 * Runs a built-in check and says what came of it: the session it started —
 * handed to `started`, or opened from a toast — or, with nothing to look
 * at, that there was nothing, the words put back with `restore`: over the
 * whole archive, how much it has looked at, with one way on — to where it
 * last looked while proposals wait there, else to look at all of it again.
 * Entities it is run on start over by themselves once all of them is looked
 * at. Resolves to the session, if one started.
 */
export async function runAiCheck(
  check: Pick<AiTemplateItem, 'templateId' | 'title' | 'builtin'>,
  options: {
    /** The entities it is about, by ref. */
    about?: string[];
    /** The owner's words it was sent with. */
    request?: string;
    /** The model chosen for its session; none for the connection's. */
    model?: string;
    started?: (sessionUuid: string) => void;
    restore?: () => void;
    /** All it looked at forgotten first: the whole archive from the start. */
    again?: boolean;
  } = {},
): Promise<string | null> {
  const title = publicText(check.title);
  try {
    const answer = await aiApi.runCheck(check.templateId, {
      ...(options.about?.length ? { about: options.about } : {}),
      ...(options.request ? { request: options.request } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(options.again ? { again: true } : {}),
    });
    const { sessionUuid } = answer;
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
    if (options.about?.length) {
      showToast(phrase.value.ai_template_nothing_here(title));
      return null;
    }
    const looked = answer.looked ?? 0;
    const last = answer.lastWaiting ? answer.lastSessionUuid : undefined;
    showToast(
      looked && check.builtin
        ? phrase.value.ai_template_looked_all(title, looked, check.builtin)
        : phrase.value.ai_template_nothing_new(title),
      last
        ? {
            label: phrase.value.ai_template_last_open,
            run: () => {
              void navigateTo({
                path: '/admin/ai/',
                query: { session: last },
              });
            },
          }
        : looked
          ? {
              label: phrase.value.ai_template_again,
              run: () =>
                void runAiCheck(check, {
                  ...options,
                  restore: undefined,
                  again: true,
                }),
            }
          : undefined,
    );
  } catch (caught) {
    options.restore?.();
    showToast(errorMessage(caught, phrase.value.ai_error));
  }
  return null;
}
