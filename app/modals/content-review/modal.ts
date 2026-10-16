export const contentReviewModal = defineModal(
  'content-review',
  () => import('./ContentReviewModal.vue'),
  {
    kind: 'card',
    width: 'max-w-200',
    ground: 'page',
    title: () => phrase.value.ai_review_title,
  },
);
