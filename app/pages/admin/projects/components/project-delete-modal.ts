export const projectDeleteModal = defineModal(
  'project-delete',
  () => import('./ProjectDeletePane.vue'),
  {
    kind: 'card',
    width: 'max-w-128',
    icon: 'delete',
    title: () => phrase.value.delete_project,
  },
);
