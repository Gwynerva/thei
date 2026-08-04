<script lang="ts" setup>
import type { ProjectContentSectionEditItem } from '#layers/thei/shared/project-content-section';
import type { ProjectStageEditItem } from '#layers/thei/shared/project-stage';
import type { ProjectStructuredItemBase } from '#layers/thei/shared/project-structured-item';
import type { DateRange } from '#layers/thei/shared/date-range';
import { isContentEmpty } from '#layers/thei/shared/content';
import FieldContentEditor from '#layers/thei/app/components/field/FieldContentEditor.vue';
import FieldDateRangePicker from '#layers/thei/app/components/field/FieldDateRangePicker.vue';
import ModalWindow from '#layers/thei/app/modals/ModalWindow.vue';

type ModalData =
  | { kind: 'stage'; item?: ProjectStageEditItem }
  | { kind: 'section'; item?: ProjectContentSectionEditItem };
type Result =
  | { type: 'save'; kind: 'stage'; item: ProjectStageEditItem }
  | { type: 'save'; kind: 'section'; item: ProjectContentSectionEditItem };
type ItemDraft = ProjectStructuredItemBase & {
  stageUuid?: string;
  sectionUuid?: string;
  period?: DateRange;
};

const emit = defineEmits<{ modalResult: [result: Result] }>();
const props = defineProps<{ modalData: ModalData }>();
const isStage = computed(() => props.modalData.kind === 'stage');
const initialItem = createInitialItem(props.modalData);
const { value: item, isDirty } = useSerializableState(initialItem);
const titleError = ref<string>();
const periodError = ref<string>();
const contentError = ref<string>();

useModalCloseGuard(
  () => !isDirty.value || window.confirm(phrase.value.unsaved_modal_confirm),
);

watch(
  () => item.value.title,
  () => {
    titleError.value = undefined;
  },
);
watch(
  () => item.value.period,
  () => {
    periodError.value = undefined;
  },
  { deep: true },
);
watch(
  () => item.value.content?.data,
  () => {
    contentError.value = undefined;
  },
  { deep: true },
);

function save() {
  if (!isDirty.value) return;
  titleError.value = item.value.title.trim()
    ? undefined
    : phrase.value.this_field_must_be_filled;
  periodError.value =
    isStage.value && !item.value.period
      ? phrase.value.project_stage_period_required
      : undefined;
  contentError.value =
    !isStage.value && isContentEmpty(item.value.content?.data)
      ? phrase.value.content_section_content_required
      : undefined;
  if (titleError.value || periodError.value || contentError.value) return;
  const base: ProjectStructuredItemBase = {
    title: item.value.title.trim(),
    summary: item.value.summary.trim(),
    isPrivate: item.value.isPrivate,
    content: item.value.content,
  };
  if (props.modalData.kind === 'stage') {
    emit('modalResult', {
      type: 'save',
      kind: 'stage',
      item: {
        ...base,
        stageUuid: item.value.stageUuid,
        period: item.value.period!,
      },
    });
    return;
  }
  emit('modalResult', {
    type: 'save',
    kind: 'section',
    item: {
      ...base,
      sectionUuid: item.value.sectionUuid,
      content: item.value.content!,
    },
  });
}

function createInitialItem(data: ModalData): ItemDraft {
  if (data.kind === 'stage') {
    return {
      stageUuid: data.item?.stageUuid,
      title: data.item?.title ?? '',
      summary: data.item?.summary ?? '',
      isPrivate: data.item?.isPrivate ?? false,
      content: data.item?.content ?? null,
      period: data.item?.period,
    };
  }
  return {
    sectionUuid: data.item?.sectionUuid,
    title: data.item?.title ?? '',
    summary: data.item?.summary ?? '',
    isPrivate: data.item?.isPrivate ?? false,
    content: data.item?.content ?? null,
  };
}
</script>

<template>
  <ModalWindow
    :title="
      item.title || (isStage ? phrase.project_stage : phrase.content_section)
    "
    width="48rem"
  >
    <template #header-actions>
      <Button class="font-semibold" :disabled="!isDirty" @click="save">
        {{ isDirty ? phrase.save : phrase.saved }}
      </Button>
    </template>

    <div class="flex flex-col gap-md">
      <Field>
        <div class="flex items-center justify-between gap-sm">
          <FieldLabel required>{{
            isStage ? phrase.project_stage_title : phrase.content_section_title
          }}</FieldLabel>
          <span
            :data-title-popup="
              isStage
                ? phrase.project_stage_private_hint
                : phrase.content_section_private_hint
            "
          >
            <FieldToggle v-model="item.isPrivate">
              <span class="inline-flex items-center gap-1">
                <Icon v-if="!isStage" name="lock-close" />
                {{
                  isStage
                    ? phrase.project_stage_private
                    : phrase.content_section_private
                }}
              </span>
            </FieldToggle>
          </span>
        </div>
        <FieldInput
          v-model="item.title"
          :error="titleError"
          autocomplete="off"
        />
      </Field>
      <Field>
        <FieldLabel>{{
          isStage
            ? phrase.project_stage_summary
            : phrase.content_section_summary
        }}</FieldLabel>
        <FieldInput v-model="item.summary" autocomplete="off" />
      </Field>

      <Field v-if="isStage">
        <FieldLabel required>{{ phrase.project_stage_period }}</FieldLabel>
        <FieldDateRangePicker v-model="item.period" />
        <FieldHint v-if="periodError" class="text-text-error">{{
          periodError
        }}</FieldHint>
      </Field>

      <Field>
        <FieldLabel :required="!isStage">{{
          isStage
            ? phrase.project_stage_content
            : phrase.content_section_content
        }}</FieldLabel>
        <FieldContentEditor
          v-model="item.content"
          :title-label="
            isStage
              ? phrase.project_stage_content
              : phrase.content_section_content
          "
        />
        <FieldHint v-if="contentError" class="text-text-error">{{
          contentError
        }}</FieldHint>
      </Field>
    </div>
  </ModalWindow>
</template>
