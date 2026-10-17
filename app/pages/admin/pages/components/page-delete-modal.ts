export const pageDeleteModal = defineModal(
  'page-delete',
  () => import('./PageDeletePane.vue'),
  {
    kind: 'card',
    width: 'max-w-128',
    icon: 'delete',
    title: () => phrase.value.delete_page,
  },
);
