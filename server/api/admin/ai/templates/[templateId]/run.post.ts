import { requireAiOn } from '../../../../../thei/ai-on';
import { findEntity } from '../../../../../thei/entity-kinds';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { runTemplate } from '../../../../../thei/ai/templates/run';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * The owner runs a template now, and its session starts — from an entity's
 * page, about that entity. The browser names the owner's time zone, so the
 * model knows which day «today» is for them.
 */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<{ sessionUuid: string }> => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body =
      (await readBody<{ from?: unknown; timeZone?: unknown }>(event)) ?? {};
    const launchedFrom =
      body.from === undefined ? undefined : findEntity(body.from);
    if (body.from !== undefined && !launchedFrom)
      throw createError({ statusCode: 404 });
    return runTemplate(getRouterParam(event, 'templateId') ?? '', {
      launchedFrom,
      ...(typeof body.timeZone === 'string'
        ? { timeZone: body.timeZone.slice(0, 64) }
        : {}),
    });
  }),
);
