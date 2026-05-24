<script lang="ts" setup>
import Modal from '#layers/thei/app/components/Modal.vue';
import { projectDataInjectionKey } from '../composables';

const { projectUuid } = defineProps<{ projectUuid: string }>();
const projectData = inject(projectDataInjectionKey)!;

const modalRef = ref<InstanceType<typeof Modal>>();
const confirmInput = ref('');
const deleting = ref(false);

const isConfirmed = computed(
  () => confirmInput.value === projectData.value.title.trim(),
);

const requestFetch = useRequestFetch();

async function handleDelete() {
  if (!isConfirmed.value || deleting.value) return;
  deleting.value = true;
  try {
    const url = `/api/admin/projects/${projectUuid}/`;
    await requestFetch(url, { method: 'DELETE' });
    await refreshNuxtData('admin-bar');
    await navigateTo('/admin/projects/');
  } finally {
    deleting.value = false;
  }
}

function open() {
  confirmInput.value = '';
  modalRef.value?.open();
}

defineExpose({ open });
</script>

<template>
  <Modal ref="modalRef" :title="phrase.delete_project">
    <div class="flex flex-col gap-md">
      <p class="text-sm text-text-2">{{ phrase.delete_project_confirm }}</p>
      <Field>
        <FieldInput
          v-model="confirmInput"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="projectData.title"
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
    </div>
  </Modal>
</template>
