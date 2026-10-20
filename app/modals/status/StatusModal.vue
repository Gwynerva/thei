<script setup lang="ts">
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { StatusKind } from '#layers/thei/shared/status';
import { toDateString } from '#layers/thei/shared/date-range';
import { normalizeCaptionText } from '#layers/thei/shared/terminal-punctuation';
import ModalContainer from '../ModalContainer.vue';
import ModalTitle from '../ModalTitle.vue';
import type { FormNeed } from '#layers/thei/app/composables/form-needs';
const { modalData } = defineProps<{
  modalData: {
    usageDelta: Record<string, number>;
    /**
     * Whether a status left blank may stand on this day as an empty one, which
     * depends on what the history holds just below that day.
     */
    canBeEmptyOn: (date: string) => boolean;
    /**
     * A status to edit instead of adding a new one. An empty status comes in
     * with blank text: filled in it becomes a regular one, left blank it can
     * still move to another day.
     */
    initial?: {
      id: string;
      kind: StatusKind;
      date: string;
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
        date: string;
        text: string;
        assetUuid?: string;
        media?: MediaDescriptor;
      }
    | { type: 'save'; id: string; kind: 'empty'; date: string },
  ];
}>();
const initial = modalData.initial;
const today = new Date();
const text = ref(initial?.text ?? '');
const date = ref(initial?.date ?? toDateString(today));
const assetUuid = ref<string | null>(initial?.assetUuid ?? null);
const media = ref<MediaDescriptor | undefined>(initial?.media);
const modalContainer =
  useTemplateRef<InstanceType<typeof ModalContainer>>('modalContainer');
// A regular status keeps something to say; a blank one is empty, which only
// a new or an already empty status may be, and only where the order allows.
const needs = useFormNeeds(
  () => {
    const list: FormNeed[] = [];
    if (!date.value)
      list.push({ key: 'date', label: phrase.value.profile_status_date });
    else if (
      !text.value.trim() &&
      (initial?.kind === 'regular' ||
        assetUuid.value ||
        !modalData.canBeEmptyOn(date.value))
    )
      list.push({ key: 'text', label: phrase.value.profile_status });
    return list;
  },
  { root: () => modalContainer.value?.root },
);
const dirty = computed(() =>
  initial
    ? text.value !== initial.text ||
      date.value !== initial.date ||
      assetUuid.value !== (initial.assetUuid ?? null)
    : Boolean(text.value || assetUuid.value),
);
function save() {
  if (initial && !dirty.value) return;
  // Asked by a press or Ctrl+S, a save it cannot make says why.
  if (needs.blocked.value) return needs.ask();
  const value = normalizeCaptionText(text.value.trim());
  const id = initial?.id ?? crypto.randomUUID();
  emit(
    'modalResult',
    value
      ? {
          type: 'save',
          id,
          kind: 'regular',
          date: date.value,
          text: value,
          assetUuid: assetUuid.value ?? undefined,
          media: media.value,
        }
      : { type: 'save', id, kind: 'empty', date: date.value },
  );
}
useSaveShortcut(save, {
  canSave: () => !initial || dirty.value,
  root: () => modalContainer.value?.root,
  exclusive: true,
});
useModalCloseGuard(
  () => !dirty.value || window.confirm(phrase.value.unsaved_modal_confirm),
);
</script>
<template>
  <ModalContainer ref="modalContainer" class="max-w-120">
    <template #header
      ><div class="flex items-center justify-between gap-sm p-sm">
        <ModalTitle
          :title="
            initial ? phrase.profile_edit_status : phrase.profile_new_status
          "
          class="min-w-0"
        /><AdminSaveButton
          :label="initial ? phrase.save : phrase.add"
          :disabled="Boolean(initial) && !dirty"
          :reason="needs.reason.value"
          @click="save"
        />
      </div>
      <HeaderErrorLine
        inset
        :message="needs.line.value"
        :again="needs.asks.value"
    /></template>
    <div class="flex flex-col gap-md p-md">
      <div class="flex min-w-0 items-start gap-md">
        <ProfileMediaField
          v-model="assetUuid"
          v-model:media="media"
          :title="phrase.profile_status_icon"
          profile="profile-status"
          :usage-delta="modalData.usageDelta"
          compact
          class="shrink-0"
        />
        <Field need="date" class="min-w-0 flex-1">
          <FieldLabel required>{{ phrase.profile_status_date }}</FieldLabel>
          <FieldDatePicker
            v-model="date"
            :label="phrase.profile_status_date"
            :max-date="today"
            placement="bottom-start"
            required
          />
        </Field>
      </div>
      <Field need="text">
        <FieldLabel>{{ phrase.profile_status }}</FieldLabel>
        <FieldTextarea
          v-model="text"
          class="min-h-24"
          :placeholder="phrase.profile_status_placeholder"
        />
      </Field>
    </div>
  </ModalContainer>
</template>
