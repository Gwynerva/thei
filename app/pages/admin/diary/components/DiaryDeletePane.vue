<script lang="ts" setup>
import DeleteConfirmationPane from '#layers/thei/app/modals/DeleteConfirmationPane.vue';

const emit = defineEmits<{ modalResult: [result: { type: 'deleted' }] }>();
const props = defineProps<{
  modalData: { diaryUuid: string; date: string };
}>();
const deleting = ref(false);

async function handleDelete() {
  if (deleting.value) return;
  deleting.value = true;
  try {
    await useRequestFetch()(`/api/admin/diary/${props.modalData.diaryUuid}`, {
      method: 'DELETE',
    });
    emit('modalResult', { type: 'deleted' });
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <DeleteConfirmationPane
    :title="phrase.diary_delete_confirm"
    entity-icon="thought"
    :entity-type="phrase.diary_entry.toLocaleLowerCase()"
    :confirmation-name="modalData.date"
    :deleting="deleting"
    @confirm="handleDelete"
  />
</template>
