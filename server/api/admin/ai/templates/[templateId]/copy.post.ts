import type { AiTemplateItem } from '#layers/thei/shared/ai-template';
import { requireAiOn } from '../../../../../thei/ai-on';
import { withRefusals } from '../../../../../thei/ai/refusals';
import { copyTemplate } from '../../../../../thei/ai/templates/store';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/** The owner makes a ready-made request of their own from a template. */
export default defineEventHandler((event) =>
  withRefusals((): AiTemplateItem => {
    requireAiOn();
    markReadOnlyRequest(event);
    return copyTemplate(getRouterParam(event, 'templateId') ?? '');
  }),
);
