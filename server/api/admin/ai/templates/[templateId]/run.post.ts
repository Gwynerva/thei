import type { AiTemplateRunResponse } from '#layers/thei/shared/ai-template';
import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { runTemplate } from '../../../../../thei/ai/templates/run';
import { chosenModel } from '../../../../../thei/ai/model/settings';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';
import { rememberOrigin } from '../../../../../thei/ai/runner/background-event';

/**
 * The owner runs a built-in check: over what it has not looked at yet of
 * the whole archive, or of the entities named in `about` — an entity's ✦,
 * those the words mention — which start over once all of them is looked at;
 * `request` is the owner's words, which may narrow it further, and `model`
 * the one its session is answered with. `again` looks at the whole archive
 * from the start. Nothing to look at, no session starts.
 */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<AiTemplateRunResponse> => {
    requireAiOn();
    markReadOnlyRequest(event);
    // A site with no address of its own links as the owner reached it.
    rememberOrigin(event);
    const body =
      (await readBody<{
        about?: unknown;
        request?: unknown;
        model?: unknown;
        again?: unknown;
      }>(event)) ?? {};
    const model = chosenModel(body.model);
    const about = (Array.isArray(body.about) ? body.about : [body.about])
      .filter((ref): ref is string => typeof ref === 'string')
      .slice(0, 50);
    return runTemplate(getRouterParam(event, 'templateId') ?? '', {
      ...(about.length ? { about } : {}),
      ...(typeof body.request === 'string'
        ? { request: body.request.slice(0, 20_000) }
        : {}),
      ...(model ? { model } : {}),
      ...(body.again === true ? { again: true } : {}),
    });
  }),
);
