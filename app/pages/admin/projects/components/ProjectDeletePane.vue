<script lang="ts" setup>
import DeleteConfirmationPane from '#layers/thei/app/modals/DeleteConfirmationPane.vue';

const emit = defineEmits<{
  modalResult: [result: { type: 'deleted' }];
}>();

const props = defineProps<{
  modalData: {
    projectUuid: string;
    projectTitle: string;
  };
}>();

const deleting = ref(false);
/** What becomes of the excerpts about the project. */
const excerpts = ref<'keep' | 'delete'>('keep');

const projectTitle = computed(() => props.modalData.projectTitle.trim());

const requestFetch = useRequestFetch();

async function handleDelete() {
  if (deleting.value) return;
  deleting.value = true;
  try {
    await requestFetch(
      `/api/admin/projects/${props.modalData.projectUuid}?excerpts=${excerpts.value}`,
      { method: 'DELETE' },
    );
    emit('modalResult', { type: 'deleted' });
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <DeleteConfirmationPane
    :title="phrase.delete_project"
    entity-icon="project"
    :entity-type="phrase.project.toLocaleLowerCase()"
    :confirmation-name="projectTitle"
    :deleting="deleting"
    @confirm="handleDelete"
  >
    <AdminExcerptsOnDelete
      v-model="excerpts"
      :target="{ type: 'project', id: modalData.projectUuid }"
    />
  </DeleteConfirmationPane>
</template>
