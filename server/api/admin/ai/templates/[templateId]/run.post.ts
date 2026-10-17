import type { AiTemplateRunResponse } from '#layers/thei/shared/ai-template';
import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { runTemplate } from '../../../../../thei/ai/templates/run';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';
import { rememberOrigin } from '../../../../../thei/ai/runner/background-event';

/**
 * The owner runs a built-in check: over what it has not looked at yet, of
 * the entities named in `about` — an entity's ✦, those the words mention —
 * or of the whole archive, again from the start with `force`; `request` is
 * the owner's words, which may narrow it further. Nothing new to look at, no
 * session starts.
 */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<AiTemplateRunResponse> => {
    requireAiOn();
    markReadOnlyRequest(event);
    // A site with no address of its own links as the owner reached it.
    rememberOrigin(event);
    const body =
      (await readBody<{ about?: unknown; request?: unknown; force?: unknown }>(
        event,
      )) ?? {};
    const about = (Array.isArray(body.about) ? body.about : [body.about])
      .filter((ref): ref is string => typeof ref === 'string')
      .slice(0, 50);
    return runTemplate(getRouterParam(event, 'templateId') ?? '', {
      ...(about.length ? { about } : {}),
      ...(typeof body.request === 'string'
        ? { request: body.request.slice(0, 20_000) }
        : {}),
      force: body.force === true,
    });
  }),
);
