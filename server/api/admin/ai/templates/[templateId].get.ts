import type { AiTemplateDetail } from '#layers/thei/shared/ai-template';
import { requireAiOn } from '../../../../thei/ai-on';
import { listSessions } from '../../../../thei/ai/sessions/view';
import { findTemplate } from '../../../../thei/ai/templates/store';

/**
 * One template for its window, with the sessions it started — those in the
 * archive too: a scheduled run that found nothing to decide goes there.
 */
export default defineEventHandler((event): AiTemplateDetail => {
  requireAiOn();
  const template = findTemplate(getRouterParam(event, 'templateId') ?? '');
  if (!template) throw createError({ statusCode: 404 });
  return {
    template,
    sessions: listSessions({ templateId: template.templateId }).sessions,
  };
});
