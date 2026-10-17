export const tagDeleteModal = defineModal(
  'tag-delete',
  () => import('./TagDeletePane.vue'),
  {
    kind: 'card',
    width: 'max-w-128',
    icon: 'delete',
    title: () => phrase.value.delete_tag,
  },
);
