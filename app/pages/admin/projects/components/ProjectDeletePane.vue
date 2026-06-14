<script lang="ts" setup>
import ModalWindow from '#layers/thei/app/modals/ModalWindow.vue';

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
const confirmInputElement = shallowRef<HTMLInputElement>();
const deleting = ref(false);

const projectTitle = computed(() => props.modalData.projectTitle.trim());
const isConfirmed = computed(() => confirmInput.value === projectTitle.value);

const requestFetch = useRequestFetch();

function fillProjectTitle() {
  confirmInput.value = projectTitle.value;
  void nextTick(() => confirmInputElement.value?.focus());
}

function rememberConfirmInputElement(element: HTMLInputElement) {
  confirmInputElement.value = element;
}

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
  <ModalWindow :title="phrase.delete_project" width="32rem">
    <div class="flex flex-col gap-md">
      <div class="flex flex-col gap-xs text-sm text-text-2">
        <p>
          <span>{{ phrase.delete_project_permanent_prefix }}</span>
          <span
            class="mx-0.5 cursor-pointer font-semibold text-text-error underline
              decoration-dashed underline-offset-4 transition hocus:text-text-1"
            @click="fillProjectTitle"
          >
            {{ projectTitle }}
          </span>
          <span>{{ phrase.delete_project_permanent_suffix }}</span>
          <span> {{ phrase.delete_project_confirm }}</span>
        </p>
      </div>

      <Field>
        <FieldInput
          v-model="confirmInput"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="projectTitle"
          @element="rememberConfirmInputElement"
          @submit="handleDelete"
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
  </ModalWindow>
</template>
