export const pickReuseFileModal = defineModal(
  'pick-reuse-file',
  () => import('./ModalPickReuseFile.vue'),
  {
    kind: 'screen',
    icon: 'upload',
    title: () => phrase.value.asset_pick_title,
  },
);
