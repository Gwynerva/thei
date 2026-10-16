export const assetLibraryModal = defineModal(
  'asset-library',
  () => import('./AssetLibraryModal.vue'),
  {
    kind: 'screen',
    width: 'max-w-280',
    icon: 'gallery',
    title: () => phrase.value.asset_library,
  },
);
