export const statusModal = defineModal(
  'status',
  () => import('./StatusModal.vue'),
  {
    kind: 'card',
    width: 'max-w-120',
    title: (data) =>
      data.initial
        ? phrase.value.profile_edit_status
        : phrase.value.profile_new_status,
  },
);
