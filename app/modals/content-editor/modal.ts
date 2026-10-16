export const contentEditorModal = defineModal(
  'content-editor',
  () => import('./ContentEditorModal.vue'),
  {
    kind: 'card',
    width: 'max-w-200',
    ground: 'page',
    icon: 'edit',
    title: (data) => data.title || phrase.value.content_editor_title,
  },
);
