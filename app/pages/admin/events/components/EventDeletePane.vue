<script lang="ts" setup>
import DeleteConfirmationPane from '#layers/thei/app/modals/DeleteConfirmationPane.vue';

const emit = defineEmits<{ modalResult: [result: { type: 'deleted' }] }>();
const props = defineProps<{
  modalData: { eventUuid: string; eventTitle: string };
}>();
const deleting = ref(false);

async function handleDelete() {
  if (deleting.value) return;
  deleting.value = true;
  try {
    await useRequestFetch()(`/api/admin/events/${props.modalData.eventUuid}`, {
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
    :title="phrase.delete_event"
    entity-icon="event"
    :entity-type="phrase.event.toLocaleLowerCase()"
    :confirmation-name="modalData.eventTitle.trim()"
    :deleting="deleting"
    @confirm="handleDelete"
  />
</template>
