import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

export const adminExcerptModal = defineModal(
  'admin-excerpt',
  () => import('./AdminExcerptModal.vue'),
  {
    kind: 'card',
    width: 'max-w-160',
    icon: entityTypeIcon('excerpt'),
    title: () => phrase.value.excerpt,
  },
);

export const adminExcerptDeleteModal = defineModal(
  'admin-excerpt-delete',
  () => import('./AdminExcerptDeletePane.vue'),
  {
    kind: 'card',
    width: 'max-w-128',
    icon: 'delete',
    title: () => phrase.value.delete_excerpt,
  },
);
