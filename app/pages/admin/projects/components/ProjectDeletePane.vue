<script lang="ts" setup>
const { projectUuid, projectTitle } = defineProps<{
  projectUuid: string;
  projectTitle: string;
}>();

const modal = useModal();
const confirmInput = ref('');
const deleting = ref(false);

const isConfirmed = computed(() => confirmInput.value === projectTitle.trim());

const requestFetch = useRequestFetch();

async function handleDelete() {
  if (!isConfirmed.value || deleting.value) return;
  deleting.value = true;
  try {
    await requestFetch(`/api/admin/projects/${projectUuid}/`, {
      method: 'DELETE',
    });
    await refreshNuxtData('admin-bar');
    modal.close();
    await navigateTo('/admin/projects/');
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-md">
    <p class="text-sm text-text-2">{{ phrase.delete_project_confirm }}</p>
    <Field>
      <FieldInput
        v-model="confirmInput"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :placeholder="projectTitle"
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
</template>
