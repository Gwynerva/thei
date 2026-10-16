import type { AiTemplateRunResponse } from '#layers/thei/shared/ai-template';
import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { runTemplate } from '../../../../../thei/ai/templates/run';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * The owner runs a built-in check: over what it has not looked at yet, or,
 * from an entity's ✦, over that entity — again from the start with `force`.
 * Nothing new to look at, no session starts.
 */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<AiTemplateRunResponse> => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body =
      (await readBody<{ about?: unknown; force?: unknown }>(event)) ?? {};
    return runTemplate(getRouterParam(event, 'templateId') ?? '', {
      ...(typeof body.about === 'string' ? { about: body.about } : {}),
      force: body.force === true,
    });
  }),
);
