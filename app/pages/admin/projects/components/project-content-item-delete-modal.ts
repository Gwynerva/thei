export const projectContentItemDeleteModal = defineModal(
  'project-content-item-delete',
  () => import('./ProjectContentItemDeletePane.vue'),
  {
    kind: 'card',
    width: 'max-w-128',
    icon: 'delete',
    title: () => phrase.value.delete_content_section,
  },
);
