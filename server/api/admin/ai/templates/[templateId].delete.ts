import { requireAiOn } from '../../../../thei/ai-on';
import { withRefusals } from '../../../../thei/ai/refusals';
import { deleteTemplate } from '../../../../thei/ai/templates/store';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/** The owner deletes a template of their own; its sessions stay. */
export default defineEventHandler((event) =>
  withRefusals(() => {
    requireAiOn();
    markReadOnlyRequest(event);
    deleteTemplate(getRouterParam(event, 'templateId') ?? '');
    return { ok: true };
  }),
);
