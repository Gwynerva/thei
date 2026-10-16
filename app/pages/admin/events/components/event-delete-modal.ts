export const eventDeleteModal = defineModal(
  'event-delete',
  () => import('./EventDeletePane.vue'),
  {
    kind: 'card',
    width: 'max-w-128',
    icon: 'delete',
    title: () => phrase.value.delete_event,
  },
);
