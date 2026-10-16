export const relationModal = defineModal(
  'relation',
  () => import('./RelationModal.vue'),
  {
    kind: 'card',
    width: 'max-w-140',
    icon: 'arrow-cycle',
    title: (data) =>
      data.relation ? phrase.value.relation : phrase.value.related_entity_add,
  },
);
