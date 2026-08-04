<script lang="ts" setup>
import DeleteConfirmationPane from '#layers/thei/app/modals/DeleteConfirmationPane.vue';

defineEmits<{ modalResult: [result: { type: 'deleted' }] }>();
defineProps<{
  modalData: { kind: 'stage' | 'section'; title: string };
}>();
</script>

<template>
  <DeleteConfirmationPane
    :title="
      modalData.kind === 'stage'
        ? phrase.delete_project_stage
        : phrase.delete_content_section
    "
    :entity-type="
      modalData.kind === 'stage'
        ? phrase.project_stage_delete_entity
        : phrase.content_section_delete_entity
    "
    :confirmation-name="modalData.title"
    :deleting="false"
    @confirm="$emit('modalResult', { type: 'deleted' })"
  />
</template>
