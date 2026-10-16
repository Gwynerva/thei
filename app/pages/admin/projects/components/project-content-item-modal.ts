import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

export const projectContentItemModal = defineModal(
  'project-content-item',
  () => import('./ProjectContentItemModal.vue'),
  {
    kind: 'card',
    width: 'max-w-160',
    icon: entityTypeIcon('project-section'),
    title: () => phrase.value.content_section,
  },
);
