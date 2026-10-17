export const assetDetailsModal = defineModal(
  'asset-details',
  () => import('./AssetDetailsModal.vue'),
  { kind: 'file', title: (data) => data.asideTitle },
);
