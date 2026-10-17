export const aiTemplateModal = defineModal(
  'ai-template',
  () => import('./AiTemplateModal.vue'),
  {
    kind: 'card',
    width: 'max-w-140',
    icon: 'template',
    title: (data) =>
      data.templateId
        ? phrase.value.ai_template_modal_title
        : phrase.value.ai_template_modal_new,
  },
);
