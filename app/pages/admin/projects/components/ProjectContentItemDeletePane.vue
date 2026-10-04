<script lang="ts" setup>
import DeleteConfirmationPane from '#layers/thei/app/modals/DeleteConfirmationPane.vue';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

defineEmits<{ modalResult: [result: { type: 'deleted' }] }>();
defineProps<{ modalData: { title: string } }>();
</script>

<template>
  <DeleteConfirmationPane
    :title="phrase.delete_content_section"
    :entity-type="phrase.content_section_delete_entity"
    :entity-icon="entityTypeIcon('project-section')"
    :confirmation-name="modalData.title"
    :deleting="false"
    @confirm="$emit('modalResult', { type: 'deleted' })"
  />
</template>
