export const diaryDeleteModal = defineModal(
  'diary-delete',
  () => import('./components/DiaryDeletePane.vue'),
  {
    kind: 'card',
    width: 'max-w-128',
    icon: 'delete',
    title: () => phrase.value.diary_delete_confirm,
  },
);
