<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import ModalContainer from './ModalContainer.vue';
import ModalTitle from './ModalTitle.vue';
import ModalHeaderButton from './ModalHeaderButton.vue';

const emit = defineEmits<{ confirm: [] }>();

const props = defineProps<{
  title: string;
  entityType: string;
  entityIcon?: IconName;
  confirmationName: string;
  deleting: boolean;
}>();

const confirmInput = ref('');
const confirmInputElement = shallowRef<HTMLInputElement>();
const confirmationNameMarker = '\u0000';
const entityTypeMarker = '\u0001';
const normalizedConfirmationName = computed(() =>
  props.confirmationName.trim(),
);
const deleteDescriptionParts = computed(() =>
  phrase.value
    .delete_confirmation_description(entityTypeMarker, confirmationNameMarker)
    .split(confirmationNameMarker),
);
const deleteDescriptionBeforeName = computed(
  () => deleteDescriptionParts.value[0] ?? '',
);
const deleteDescriptionAroundEntity = computed(() =>
  deleteDescriptionBeforeName.value.split(entityTypeMarker),
);
const deleteDescriptionAfterName = computed(() =>
  deleteDescriptionParts.value.slice(1).join(confirmationNameMarker),
);
const isConfirmed = computed(
  () => confirmInput.value === normalizedConfirmationName.value,
);

function fillConfirmationName() {
  confirmInput.value = normalizedConfirmationName.value;
  void nextTick(() => confirmInputElement.value?.focus());
}

function rememberConfirmInputElement(element: HTMLInputElement) {
  confirmInputElement.value = element;
}

function confirm() {
  if (!isConfirmed.value || props.deleting) return;
  emit('confirm');
}
</script>

<template>
  <ModalContainer class="max-w-128">
    <template #header>
      <div class="flex items-center gap-xs p-sm">
        <ModalTitle icon="delete" :title="title" class="flex-1" />
        <ModalHeaderButton
          icon="close"
          :label="phrase.close_modal"
          @click="closeModal"
        />
      </div>
    </template>
    <div class="flex flex-col gap-md p-sm">
      <div class="flex flex-col gap-xs text-sm text-text-2">
        <p>
          <span>{{ deleteDescriptionAroundEntity[0] }}</span>
          <span class="whitespace-nowrap">
            <Icon v-if="entityIcon" :name="entityIcon" class="mr-1" />
            <span>{{ entityType }}</span>
          </span>
          <span>{{ deleteDescriptionAroundEntity.slice(1).join(entityTypeMarker) }}</span>
          <button
            type="button"
            class="cursor-pointer font-semibold text-text-error underline
              decoration-dashed underline-offset-4 transition hocus:text-text-1"
            @click="fillConfirmationName"
          >
            {{ normalizedConfirmationName }}
          </button>
          <span>{{ deleteDescriptionAfterName }}</span>
        </p>
        <p>{{ phrase.delete_confirmation_confirm }}</p>
      </div>

      <Field>
        <FieldInput
          v-model="confirmInput"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="normalizedConfirmationName"
          @element="rememberConfirmInputElement"
          @submit="confirm"
        />
      </Field>

      <slot></slot>

      <Button
        variant="delete"
        class="w-full font-semibold"
        :disabled="!isConfirmed || deleting"
        @click="confirm"
      >
        <Icon v-if="deleting" name="loading" class="mr-xs" />
        <Icon v-else name="delete" class="mr-xs" />
        <span>{{ phrase.delete }}</span>
      </Button>
    </div>
  </ModalContainer>
</template>
