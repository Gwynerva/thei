export const libraryAssetDetailsModal = defineModal(
  'library-asset-details',
  () => import('./LibraryAssetDetailsModal.vue'),
  { kind: 'file', title: () => phrase.value.asset_library_properties },
);
