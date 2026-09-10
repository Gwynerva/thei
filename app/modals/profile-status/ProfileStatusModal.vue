<script setup lang="ts">
import type { MediaDescriptor } from '#layers/thei/shared/media';
import ModalContainer from '../ModalContainer.vue';
import ModalTitle from '../ModalTitle.vue';
const { modalData } = defineProps<{
  modalData: {
    usageDelta: Record<string, number>;
    canAddEmptyStatus: boolean;
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
const text = ref('');
const assetUuid = ref<string | null>(null);
const media = ref<MediaDescriptor>();
const valid = computed(
  () =>
    Boolean(text.value.trim()) ||
    (!assetUuid.value && modalData.canAddEmptyStatus),
);
const dirty = computed(() => Boolean(text.value || assetUuid.value));
function save() {
  if (!valid.value) return;
  const value = text.value.trim();
  emit(
    'modalResult',
    value
      ? {
          type: 'save',
          id: crypto.randomUUID(),
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
        <ModalTitle :title="phrase.profile_new_status" /><Button
          :disabled="!valid"
          @click="save"
          >{{ phrase.profile_add }}</Button
        >
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
