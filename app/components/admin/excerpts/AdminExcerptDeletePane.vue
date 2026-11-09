<script lang="ts" setup>
import DeleteConfirmationPane from '#layers/thei/app/modals/DeleteConfirmationPane.vue';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

defineEmits<{ modalResult: [result: { type: 'deleted' }] }>();
defineProps<{ modalData: { title: string } }>();
</script>

<template>
  <DeleteConfirmationPane
    :title="phrase.delete_excerpt"
    :entity-type="phrase.excerpt_delete_entity"
    :entity-icon="entityTypeIcon('excerpt')"
    :confirmation-name="modalData.title"
    :deleting="false"
    @confirm="$emit('modalResult', { type: 'deleted' })"
  />
</template>
