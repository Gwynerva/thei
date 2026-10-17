export const apiTokenModal = defineModal(
  'api-token',
  () => import('./ApiTokenModal.vue'),
  {
    kind: 'card',
    width: 'max-w-140',
    icon: 'key',
    title: (data) => publicText(data.token.label),
  },
);
