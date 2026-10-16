import type { AiTemplateItem } from '#layers/thei/shared/ai-template';
import { requireAiOn } from '../../../../thei/ai-on';
import { withRefusals } from '../../../../thei/ai/refusals';
import {
  saveTemplate,
  type TemplateInput,
} from '../../../../thei/ai/templates/store';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/** The owner writes a template of their own. */
export default defineEventHandler((event) =>
  withRefusals(async (): Promise<AiTemplateItem> => {
    requireAiOn();
    markReadOnlyRequest(event);
    const body = (await readBody<TemplateInput>(event)) ?? {};
    return saveTemplate(null, {
      title: body.title,
      instruction: body.instruction,
      model: body.model,
      schedule: body.schedule,
      enabled: body.enabled,
      offerOn: body.offerOn,
    });
  }),
);
