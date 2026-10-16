export const editFileModal = defineModal(
  'upload-settings',
  () => import('./ModalEditFile.vue'),
  { kind: 'file', title: () => phrase.value.upload_variants },
);
