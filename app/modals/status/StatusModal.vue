<script setup lang="ts">
import type { MediaDescriptor } from '#layers/thei/shared/media';
import ModalContainer from '../ModalContainer.vue';
import ModalTitle from '../ModalTitle.vue';
const { modalData } = defineProps<{
  modalData: {
    usageDelta: Record<string, number>;
    canAddEmptyStatus: boolean;
    /** A regular status to edit instead of adding a new one. */
    initial?: {
      id: string;
      text: string;
      assetUuid?: string;
      media?: MediaDescriptor;
    };
  };
}>();
const emit = defineEmits<{
  modalResult: [
    | {
        type: 'save';
        id: string;
        kind: 'regular';
        text: string;
        assetUuid?: string;
        media?: MediaDescriptor;
      }
    | { type: 'save'; id: string; kind: 'empty' },
  ];
}>();
const initial = modalData.initial;
const text = ref(initial?.text ?? '');
const assetUuid = ref<string | null>(initial?.assetUuid ?? null);
const media = ref<MediaDescriptor | undefined>(initial?.media);
// An edited status stays a regular one: an empty status has nothing to edit.
const valid = computed(
  () =>
    Boolean(text.value.trim()) ||
    (!initial && !assetUuid.value && modalData.canAddEmptyStatus),
);
const dirty = computed(() =>
  initial
    ? text.value !== initial.text ||
      assetUuid.value !== (initial.assetUuid ?? null)
    : Boolean(text.value || assetUuid.value),
);
function save() {
  if (!valid.value) return;
  const value = text.value.trim();
  emit(
    'modalResult',
    value
      ? {
          type: 'save',
          id: initial?.id ?? crypto.randomUUID(),
          kind: 'regular',
          text: value,
          assetUuid: assetUuid.value ?? undefined,
          media: media.value,
        }
      : { type: 'save', id: crypto.randomUUID(), kind: 'empty' },
  );
}
useModalCloseGuard(
  () => !dirty.value || window.confirm(phrase.value.unsaved_modal_confirm),
);
</script>
<template>
  <ModalContainer class="max-w-120">
    <template #header
      ><div class="flex items-center justify-between gap-sm p-sm">
        <ModalTitle
          :title="
            initial ? phrase.profile_edit_status : phrase.profile_new_status
          "
        /><Button :disabled="!valid || (initial && !dirty)" @click="save">{{
          initial ? phrase.save : phrase.profile_add
        }}</Button>
      </div></template
    >
    <div class="flex min-w-0 items-start gap-sm p-md">
      <ProfileMediaField
        v-model="assetUuid"
        v-model:media="media"
        :title="phrase.profile_status"
        profile="profile-status"
        :usage-delta="modalData.usageDelta"
        compact
        hide-label
        class="shrink-0"
      />
      <div class="min-w-0 flex-1">
        <FieldTextarea
          v-model="text"
          class="min-h-12"
          :placeholder="phrase.profile_status_placeholder"
        />
      </div>
    </div>
  </ModalContainer>
</template>
