import type { AiTemplateListResponse } from '#layers/thei/shared/ai-template';
import { requireAiOn } from '../../../../thei/ai-on';
import { listTemplates } from '../../../../thei/ai/templates/store';

/** The templates: the built-in ones first, then the owner's own. */
export default defineEventHandler((): AiTemplateListResponse => {
  requireAiOn();
  return { templates: listTemplates() };
});
