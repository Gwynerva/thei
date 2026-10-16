import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { runTemplate } from '../../../../../thei/ai/templates/run';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * The owner runs a template of a schedule now, and its session starts. The
 * browser names the owner's time zone, so the model knows which day «today»
 * is for them.
 */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<{ sessionUuid: string }> => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<{ timeZone?: unknown }>(event)) ?? {};
    return runTemplate(getRouterParam(event, 'templateId') ?? '', {
      ...(typeof body.timeZone === 'string'
        ? { timeZone: body.timeZone.slice(0, 64) }
        : {}),
    });
  }),
);
