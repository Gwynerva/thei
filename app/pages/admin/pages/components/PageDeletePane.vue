<script lang="ts" setup>
import DeleteConfirmationPane from '#layers/thei/app/modals/DeleteConfirmationPane.vue';

const emit = defineEmits<{ modalResult: [result: { type: 'deleted' }] }>();
const props = defineProps<{
  modalData: { pageUuid: string; pageTitle: string };
}>();
const deleting = ref(false);

async function handleDelete() {
  if (deleting.value) return;
  deleting.value = true;
  try {
    await useRequestFetch()(`/api/admin/pages/${props.modalData.pageUuid}`, {
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
    :title="phrase.delete_page"
    entity-icon="page"
    :entity-type="phrase.page.toLocaleLowerCase()"
    :confirmation-name="modalData.pageTitle.trim()"
    :deleting="deleting"
    @confirm="handleDelete"
  />
</template>
