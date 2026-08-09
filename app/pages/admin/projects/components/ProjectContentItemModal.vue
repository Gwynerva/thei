<script lang="ts" setup>
import {
  normalizeStagePeriods,
  type ProjectContentItemBase,
  type ProjectSectionContentItem,
  type ProjectStageContentItem,
} from '#layers/thei/shared/project-content-item';
import type { DateRange } from '#layers/thei/shared/date-range';
import { isContentEmpty } from '#layers/thei/shared/content';
import FieldContentEditor from '#layers/thei/app/components/field/FieldContentEditor.vue';
import FieldDateRangePicker from '#layers/thei/app/components/field/FieldDateRangePicker.vue';
import FloatingPopup from '#layers/thei/app/components/FloatingPopup.vue';
import ModalContainer from '#layers/thei/app/modals/ModalContainer.vue';
import ModalTitle from '#layers/thei/app/modals/ModalTitle.vue';
import ModalHeaderButton from '#layers/thei/app/modals/ModalHeaderButton.vue';
import { projectContentItemDeleteModal } from './project-content-item-delete-modal';

type ModalData =
  | { isStage: true; item?: ProjectStageContentItem }
  | { isStage: false; item?: ProjectSectionContentItem };
type Result =
  | { type: 'save'; item: ProjectStageContentItem | ProjectSectionContentItem }
  | { type: 'deleted' };
type ItemDraft = ProjectContentItemBase & {
  stageUuid?: string;
  sectionUuid?: string;
  periods?: DateRange[];
};

const emit = defineEmits<{ modalResult: [result: Result] }>();
const props = defineProps<{ modalData: ModalData }>();
const isStage = computed(() => props.modalData.isStage);
const { value: item, isDirty } = useSerializableState(
  createInitialItem(props.modalData),
);
const periodPopupOpen = ref(false);
const periodPopupAnchor = useTemplateRef<HTMLElement>('periodPopupAnchor');
const pendingPeriod = ref<DateRange>();
const canSave = computed(() => {
  if (!isDirty.value || !item.value.title.trim()) return false;
  return isStage.value
    ? Boolean(item.value.periods?.length)
    : !isContentEmpty(item.value.content?.data);
});

useModalCloseGuard(
  () => !isDirty.value || window.confirm(phrase.value.unsaved_modal_confirm),
);
watch(pendingPeriod, (period) => {
  if (!period) return;
  item.value.periods = normalizeStagePeriods([
    ...(item.value.periods ?? []),
    period,
  ]);
  pendingPeriod.value = undefined;
  periodPopupOpen.value = false;
});

function save() {
  if (!canSave.value) return;
  const base: ProjectContentItemBase = {
    title: item.value.title.trim(),
    summary: item.value.summary.trim(),
    isPrivate: item.value.isPrivate,
    content: item.value.content,
  };
  if (props.modalData.isStage) {
    emit('modalResult', {
      type: 'save',
      item: {
        ...base,
        isStage: true,
        stageUuid: item.value.stageUuid,
        periods: normalizeStagePeriods(item.value.periods),
      },
    });
  } else {
    emit('modalResult', {
      type: 'save',
      item: {
        ...base,
        isStage: false,
        sectionUuid: item.value.sectionUuid,
        content: item.value.content!,
      },
    });
  }
}

function createInitialItem(data: ModalData): ItemDraft {
  return {
    stageUuid: data.isStage ? data.item?.stageUuid : undefined,
    sectionUuid: !data.isStage ? data.item?.sectionUuid : undefined,
    title: data.item?.title ?? '',
    summary: data.item?.summary ?? '',
    isPrivate: data.item?.isPrivate ?? false,
    content: data.item?.content ?? null,
    periods: data.isStage ? (data.item?.periods ?? []) : undefined,
  };
}

function removePeriod(index: number) {
  item.value.periods = (item.value.periods ?? []).filter((_, i) => i !== index);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(language.value.code, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00`));
}

function formatPeriod(period: DateRange) {
  const startDate = formatDate(period.startDate);
  return period.startDate === period.endDate
    ? startDate
    : `${startDate} — ${formatDate(period.endDate)}`;
}

async function deleteItem() {
  if (!props.modalData.item) return;
  const result = await openModal(projectContentItemDeleteModal, {
    kind: props.modalData.isStage ? 'stage' : 'section',
    title: item.value.title,
  });
  if (result.type === 'deleted') emit('modalResult', result);
}
</script>

<template>
  <ModalContainer class="max-w-160">
    <template #header>
      <div class="flex items-center gap-sm p-sm">
        <ModalTitle
          :icon="isStage ? 'calendar' : 'file-tray-stack'"
          :title="isStage ? phrase.project_stage : phrase.content_section"
          class="flex-1"
        />
        <div class="flex items-center gap-xs">
          <ModalHeaderButton
            v-if="modalData.item"
            icon="delete"
            variant="delete"
            :label="
              isStage
                ? phrase.delete_project_stage
                : phrase.delete_content_section
            "
            @click="deleteItem"
          />
          <ModalHeaderButton
            icon="close"
            :label="phrase.close_modal"
            @click="closeModal"
          />
          <ModalHeaderButton
            variant="accent"
            :label="phrase.save"
            :disabled="!canSave"
            @click="save"
          >
            {{ isDirty || !modalData.item ? phrase.save : phrase.saved }}
          </ModalHeaderButton>
        </div>
      </div>
    </template>

    <div class="flex flex-col gap-md p-sm">
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
                <Icon name="lock-close" />
                <span class="max-sm:hidden">
                  {{
                    isStage
                      ? phrase.project_stage_private
                      : phrase.content_section_private
                  }}
                </span>
              </span>
            </FieldToggle>
          </span>
        </div>
        <FieldInput v-model="item.title" autocomplete="off" />
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
        <div class="flex items-center justify-between gap-sm">
          <FieldLabel required>{{ phrase.project_stage_period }}</FieldLabel>
          <div ref="periodPopupAnchor">
            <ModalHeaderButton
              icon="plus"
              :label="phrase.add"
              @click="periodPopupOpen = !periodPopupOpen"
            >
              {{ phrase.add }}
            </ModalHeaderButton>
            <FloatingPopup
              v-model:open="periodPopupOpen"
              :anchor="periodPopupAnchor"
              teleport-to="dialog"
              fit-content
            >
              <FieldDateRangePicker v-model="pendingPeriod" />
            </FloatingPopup>
          </div>
        </div>
        <div class="flex flex-wrap gap-xs">
          <span v-if="!item.periods?.length" class="text-sm text-text-3 italic">
            {{ phrase.project_stage_period_empty }}
          </span>
          <span
            v-for="(period, index) in item.periods"
            :key="`${period.startDate}:${period.endDate}`"
            class="inline-flex max-w-full items-center rounded-full bg-bg-3 py-1
              pr-1 pl-xs text-xs text-text-2"
          >
            <span class="truncate">{{ formatPeriod(period) }}</span>
            <button
              type="button"
              class="flex size-6 shrink-0 cursor-pointer items-center
                justify-center rounded-full text-text-2 transition-colors
                hocus:bg-bg-error hocus:text-text-error"
              :aria-label="`${phrase.delete}: ${formatPeriod(period)}`"
              @click="removePeriod(index)"
            >
              <Icon name="close" />
            </button>
          </span>
        </div>
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
            item.title.trim() ||
            (isStage
              ? phrase.project_stage_content
              : phrase.content_section_content)
          "
        />
      </Field>
    </div>
  </ModalContainer>
</template>
