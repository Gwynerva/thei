<script lang="ts" setup>
import AssetModal from '#layers/thei/app/modals/asset-modal/AssetModal.vue';
import AssetModalPreviewFile from '#layers/thei/app/modals/asset-modal/AssetModalPreviewFile.vue';
import UploadSettingsSection from '#layers/thei/app/modals/upload-settings/UploadSettingsSection.vue';

const emit = defineEmits<{
  modalResult: [result: { type: 'deleted' }];
}>();

const props = defineProps<{
  modalData: {
    projectUuid: string;
    projectTitle: string;
  };
}>();

const confirmInput = ref('');
const deleting = ref(false);

const isConfirmed = computed(
  () => confirmInput.value === props.modalData.projectTitle.trim(),
);

const requestFetch = useRequestFetch();

async function handleDelete() {
  if (!isConfirmed.value || deleting.value) return;
  deleting.value = true;
  try {
    await requestFetch(`/api/admin/projects/${props.modalData.projectUuid}/`, {
      method: 'DELETE',
    });
    emit('modalResult', { type: 'deleted' });
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <AssetModal :aside-title="phrase.delete_project">
    <template #preview>
      <AssetModalPreviewFile icon="delete" class="text-text-error" />
    </template>

    <template #aside>
      <UploadSettingsSection :active="true" :title="phrase.delete_project">
        <p class="text-sm text-text-2">{{ phrase.delete_project_confirm }}</p>
        <Field>
          <FieldInput
            v-model="confirmInput"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="modalData.projectTitle"
          />
        </Field>
        <Button
          variant="delete"
          class="w-full font-semibold"
          :disabled="!isConfirmed || deleting"
          @click="handleDelete"
        >
          <Icon v-if="deleting" name="loading" class="mr-xs" />
          <Icon v-else name="delete" class="mr-xs" />
          <span>{{ phrase.delete }}</span>
        </Button>
      </UploadSettingsSection>
    </template>
  </AssetModal>
</template>
