import type { AiTemplateItem } from '#layers/thei/shared/ai-template';
import { requireAiOn } from '../../../../thei/ai-on';
import { withRefusals } from '../../../../thei/ai/refusals';
import {
  saveTemplate,
  type TemplateInput,
} from '../../../../thei/ai/templates/store';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/**
 * The owner changes a template of their own; a built-in one is copied to be
 * changed.
 */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<AiTemplateItem> => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<TemplateInput>(event)) ?? {};
    return saveTemplate(getRouterParam(event, 'templateId') ?? '', {
      title: body.title,
      instruction: body.instruction,
    });
  }),
);
