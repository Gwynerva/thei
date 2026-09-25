<script lang="ts" setup>
import {
  normalizeStagePeriods,
  type ProjectContentItemBase,
  type ProjectSectionContentItem,
  type ProjectStageContentItem,
} from '#layers/thei/shared/project-content-item';
import type { DatedPeriod } from '#layers/thei/shared/date-precision';
import { isContentEmpty } from '#layers/thei/shared/content';
import FieldContentEditor from '#layers/thei/app/components/field/FieldContentEditor.vue';
import FieldDateRangePopup from '#layers/thei/app/components/field/FieldDateRangePopup.vue';
import DateRangeChip from '#layers/thei/app/components/DateRangeChip.vue';
import ModalContainer from '#layers/thei/app/modals/ModalContainer.vue';
import ModalTitle from '#layers/thei/app/modals/ModalTitle.vue';
import ModalHeaderButton from '#layers/thei/app/modals/ModalHeaderButton.vue';
import { buildProjectChildUrl } from '#layers/thei/shared/project-url';
import LinkField from '../../components/LinkField.vue';
import { projectContentItemDeleteModal } from './project-content-item-delete-modal';

type ProjectLinkIdentity = {
  projectHumanReadableSlug: string;
  projectPublicId: string;
};
type ModalData = ProjectLinkIdentity & {
  /**
   * Hands the item over to the project form, which saves itself when nothing
   * else is waiting. The modal stays open: saving is a checkpoint, and closing
   * is a decision of its own.
   */
  onSave: (item: ProjectStageContentItem | ProjectSectionContentItem) => void;
} & (
    | { isStage: true; item?: ProjectStageContentItem }
    | { isStage: false; item?: ProjectSectionContentItem }
  );
type Result = { type: 'deleted' };
type ItemDraft = ProjectContentItemBase & {
  stageUuid?: string;
  sectionUuid?: string;
  periods?: DatedPeriod[];
};

const emit = defineEmits<{ modalResult: [result: Result] }>();
const props = defineProps<{ modalData: ModalData }>();
const isStage = computed(() => props.modalData.isStage);
/**
 * The content object is shared with the project form once handed over, and a
 * project save stamps it with the time it was stored. The stamp is not an edit
 * made here, so it must not make the draft dirty.
 */
const {
  value: item,
  isDirty,
  markSaved,
} = useSerializableState(createInitialItem(props.modalData), {
  serialize: (draft) =>
    JSON.stringify({
      ...draft,
      content: draft.content && { ...draft.content, updatedAt: undefined },
    }),
});
/** Whether the project form holds this item: opened from it, or saved once. */
const exists = ref(Boolean(props.modalData.item));
/** The title the item is known by in the project form. */
const savedTitle = ref(props.modalData.item?.title ?? '');
const periodPopupOpen = ref(false);
const periodPopupAnchor = useTemplateRef<HTMLElement>('periodPopupAnchor');
const pendingPeriod = ref<DatedPeriod>();
const editedPeriodIndex = ref<number>();
const modalContainer =
  useTemplateRef<InstanceType<typeof ModalContainer>>('modalContainer');
const canSave = computed(() => {
  if (!isDirty.value || !item.value.title.trim()) return false;
  return isStage.value
    ? Boolean(item.value.periods?.length)
    : !isContentEmpty(item.value.content?.data);
});

useModalCloseGuard(
  () => !isDirty.value || window.confirm(phrase.value.unsaved_modal_confirm),
);
/**
 * A period is committed on a click, not the moment its dates are picked: its
 * certainty is chosen afterwards, on the popup's second step, and closing the
 * popup on the first click would never let anyone reach it.
 */
function confirmPeriod() {
  const period = pendingPeriod.value;
  if (!period) return;
  const rest = (item.value.periods ?? []).filter(
    (_, index) => index !== editedPeriodIndex.value,
  );
  item.value.periods = normalizeStagePeriods([...rest, period]);
  pendingPeriod.value = undefined;
  editedPeriodIndex.value = undefined;
  periodPopupOpen.value = false;
}

function openPeriod(index?: number) {
  editedPeriodIndex.value = index;
  pendingPeriod.value =
    index === undefined ? undefined : { ...item.value.periods![index]! };
  periodPopupOpen.value = true;
}

watch(periodPopupOpen, (isOpen) => {
  if (isOpen) return;
  pendingPeriod.value = undefined;
  editedPeriodIndex.value = undefined;
});

/**
 * Saving inside the content editor hands the stage or section over too, the
 * same as the Save button: the editor stays open, and the project form decides
 * for itself whether this item is all that changed.
 *
 * A brand-new stage is left out until it has been saved once. Adding it is a
 * decision of its own, and it is made with the Save button. And an item the
 * Save button would refuse — no title, no period — is not handed over either:
 * the project could save it straight away.
 */
function saveAfterContentEdit() {
  if (exists.value) save();
}

function handOver() {
  const built = buildItem();
  props.modalData.onSave(built);
  exists.value = true;
  savedTitle.value = built.title;
  markSaved();
}

function buildItem(): ProjectStageContentItem | ProjectSectionContentItem {
  const base: ProjectContentItemBase = {
    title: item.value.title.trim(),
    summary: item.value.summary.trim(),
    humanReadableSlug: item.value.humanReadableSlug,
    publicId: item.value.publicId,
    isPrivate: item.value.isPrivate,
    content: item.value.content,
  };
  return props.modalData.isStage
    ? {
        ...base,
        isStage: true,
        stageUuid: item.value.stageUuid,
        periods: normalizeStagePeriods(item.value.periods),
      }
    : {
        ...base,
        isStage: false,
        sectionUuid: item.value.sectionUuid,
        content: item.value.content!,
      };
}

function save() {
  if (canSave.value) handOver();
}

useSaveShortcut(save, {
  canSave,
  root: () => modalContainer.value?.root,
  exclusive: true,
});

function createInitialItem(data: ModalData): ItemDraft {
  return {
    stageUuid: data.isStage ? data.item?.stageUuid : undefined,
    sectionUuid: !data.isStage ? data.item?.sectionUuid : undefined,
    title: data.item?.title ?? '',
    summary: data.item?.summary ?? '',
    humanReadableSlug: data.item?.humanReadableSlug ?? '',
    publicId: data.item?.publicId ?? randomId(14),
    isPrivate: data.item?.isPrivate ?? false,
    content: data.item?.content ?? null,
    periods: data.isStage ? (data.item?.periods ?? []) : undefined,
  };
}

function childLinkDescription(slug: string, publicId: string) {
  return buildProjectChildUrl(
    props.modalData.projectHumanReadableSlug,
    props.modalData.projectPublicId,
    isStage.value ? 'stages' : 'sections',
    slug,
    publicId,
  );
}

/**
 * While a stage or section that already exists on the site is open, the admin
 * bar's eye leads to its own public page rather than to the project's. It
 * uses the address the item was opened with: an unsaved edit of the slug has
 * no page yet.
 */
useRegisterAdminBarContextButton(
  computed(() => {
    const data = props.modalData;
    const opened = data.item;
    const saved = data.isStage ? data.item?.stageUuid : data.item?.sectionUuid;
    if (!opened || !saved || !props.modalData.projectPublicId) return undefined;
    return {
      to: {
        href: childLinkDescription(opened.humanReadableSlug, opened.publicId),
        external: true,
      },
      icon: 'visibility',
      title: isStage.value
        ? phrase.value.view_project_stage
        : phrase.value.view_content_section,
    };
  }),
);

function removePeriod(index: number) {
  item.value.periods = (item.value.periods ?? []).filter((_, i) => i !== index);
}

async function deleteItem() {
  if (!exists.value) return;
  const result = await openModal(projectContentItemDeleteModal, {
    kind: props.modalData.isStage ? 'stage' : 'section',
    title: savedTitle.value,
  });
  if (result.type === 'deleted') emit('modalResult', result);
}
</script>

<template>
  <ModalContainer ref="modalContainer" class="max-w-160">
    <template #header>
      <div class="flex items-center gap-sm p-sm">
        <ModalTitle
          :icon="isStage ? 'calendar' : 'file-tray-stack'"
          :title="isStage ? phrase.project_stage : phrase.content_section"
          class="flex-1"
        />
        <div class="flex items-center gap-xs">
          <ModalHeaderButton
            v-if="exists"
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
            {{ isDirty || !exists ? phrase.save : phrase.saved }}
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
      <LinkField
        v-model:title="item.title"
        v-model:human-readable-slug="item.humanReadableSlug"
        v-model:public-id="item.publicId"
        :entity-name="isStage ? phrase.project_stage : phrase.content_section"
        :link-description="childLinkDescription"
      />
      <Field>
        <FieldLabel>{{
          isStage
            ? phrase.project_stage_summary
            : phrase.content_section_summary
        }}</FieldLabel>
        <FieldTextarea v-model="item.summary" />
      </Field>
      <Field v-if="isStage">
        <div class="flex items-center justify-between gap-sm">
          <FieldLabel required>{{ phrase.project_stage_period }}</FieldLabel>
          <div ref="periodPopupAnchor">
            <ModalHeaderButton
              icon="plus"
              :label="phrase.add"
              @click="
                periodPopupOpen ? (periodPopupOpen = false) : openPeriod()
              "
            >
              {{ phrase.add }}
            </ModalHeaderButton>
            <FieldDateRangePopup
              v-model="pendingPeriod"
              v-model:open="periodPopupOpen"
              :anchor="periodPopupAnchor"
              teleport-to="dialog"
              :confirm-label="
                editedPeriodIndex === undefined ? phrase.add : phrase.save
              "
              @confirm="confirmPeriod"
            />
          </div>
        </div>
        <div class="flex flex-wrap gap-xs">
          <span v-if="!item.periods?.length" class="text-sm text-text-3 italic">
            {{ phrase.project_stage_period_empty }}
          </span>
          <DateRangeChip
            v-for="(period, index) in item.periods"
            :key="`${period.startDate}:${period.endDate}`"
            :period="period"
            removable
            editable
            @edit="openPeriod(index)"
            @remove="removePeriod(index)"
          />
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
          @saved="saveAfterContentEdit"
        />
      </Field>
    </div>
  </ModalContainer>
</template>
