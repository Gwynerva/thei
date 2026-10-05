<script lang="ts" setup>
import type { ProjectSectionItem } from '#layers/thei/shared/project-content-item';
import { normalizePeriods, type Period } from '#layers/thei/shared/period';
import { normalizeHeadingText } from '#layers/thei/shared/terminal-punctuation';
import {
  createEmptyContentFieldValue,
  isContentEmpty,
  type ContentFieldModelValue,
} from '#layers/thei/shared/content';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import FieldContentEditor from '#layers/thei/app/components/field/FieldContentEditor.vue';
import FieldDateRangePopup from '#layers/thei/app/components/field/FieldDateRangePopup.vue';
import DateRangeChip from '#layers/thei/app/components/DateRangeChip.vue';
import ModalContainer from '#layers/thei/app/modals/ModalContainer.vue';
import ModalTitle from '#layers/thei/app/modals/ModalTitle.vue';
import ModalHeaderButton from '#layers/thei/app/modals/ModalHeaderButton.vue';
import { buildProjectSectionUrl } from '#layers/thei/shared/project-url';
import LinkField from '../../components/LinkField.vue';
import { projectContentItemDeleteModal } from './project-content-item-delete-modal';
import { provideContentOwner } from '#layers/thei/app/composables/content-history/owner';

type ModalData = {
  projectHumanReadableSlug: string;
  projectPublicId: string;
  item?: ProjectSectionItem;
  /**
   * Hands the section over to the project form, which saves itself when
   * nothing else is waiting. The modal stays open: saving is a checkpoint,
   * and closing is a decision of its own.
   */
  onSave: (item: ProjectSectionItem) => void;
  /**
   * How many more times each file would be placed in the project, were this
   * section saved as it stands: the editor counts a file's uses with it.
   */
  usageDelta: (item: ProjectSectionItem) => Record<string, number>;
};
type Result = { type: 'deleted' };
type SectionDraft = Omit<ProjectSectionItem, 'content'> & {
  content: ContentFieldModelValue | null;
};

const emit = defineEmits<{ modalResult: [result: Result] }>();
const props = defineProps<{ modalData: ModalData }>();
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
/** Whether the project form holds this section: opened from it, or saved once. */
const exists = ref(Boolean(props.modalData.item));
/** The title the section is known by in the project form. */
const savedTitle = ref(props.modalData.item?.title ?? '');
const periodPopupOpen = ref(false);
const periodPopupAnchor = useTemplateRef<HTMLElement>('periodPopupAnchor');
const pendingPeriod = ref<Period>();
const editedPeriodIndex = ref<number>();
const modalContainer =
  useTemplateRef<InstanceType<typeof ModalContainer>>('modalContainer');
const hasBody = computed(() => !isContentEmpty(item.value.content?.data));
const bannerAssetUuid = computed({
  get: () => item.value.bannerAssetUuid ?? null,
  set: (value: string | null) => {
    item.value.bannerAssetUuid = value ?? undefined;
  },
});
function bannerUsageDelta() {
  return props.modalData.usageDelta(buildItem());
}
/** A section says something with a body, its dates, or both. */
const canSave = computed(
  () =>
    isDirty.value &&
    Boolean(item.value.title.trim()) &&
    (item.value.periods.length > 0 || hasBody.value),
);

useModalCloseGuard(
  () => !isDirty.value || window.confirm(phrase.value.unsaved_modal_confirm),
);
useBeforeUnloadGuard(() => isDirty.value);
// A section not saved yet keeps its text's history under an address of its
// own; it is not offered drafts of other new ones, which it could not tell
// apart.
provideContentOwner('project-section', () => item.value.sectionUuid, {
  offersPendingDrafts: false,
});
/**
 * A period is committed on a click, not the moment its dates are picked: its
 * certainty is chosen afterwards, on the popup's second step, and closing the
 * popup on the first click would never let anyone reach it.
 */
function confirmPeriod() {
  const period = pendingPeriod.value;
  if (!period) return;
  const rest = item.value.periods.filter(
    (_, index) => index !== editedPeriodIndex.value,
  );
  item.value.periods = normalizePeriods([...rest, period]);
  pendingPeriod.value = undefined;
  editedPeriodIndex.value = undefined;
  periodPopupOpen.value = false;
}

function openPeriod(index?: number) {
  editedPeriodIndex.value = index;
  pendingPeriod.value =
    index === undefined ? undefined : { ...item.value.periods[index]! };
  periodPopupOpen.value = true;
}

watch(periodPopupOpen, (isOpen) => {
  if (isOpen) return;
  pendingPeriod.value = undefined;
  editedPeriodIndex.value = undefined;
});

/**
 * Saving inside the content editor hands the section over too, the same as
 * the Save button: the editor stays open, and the project form decides for
 * itself whether this section is all that changed.
 *
 * A brand-new section is left out until it has been saved once. Adding it is
 * a decision of its own, and it is made with the Save button. And a section
 * the Save button would refuse — no title — is not handed over either: the
 * project could save it straight away.
 */
function saveAfterContentEdit() {
  if (exists.value) save();
}

function handOver() {
  const built = buildItem();
  props.modalData.onSave(built);
  exists.value = true;
  savedTitle.value = built.title;
  // The field shows the title as it was handed over, its ending settled.
  item.value.title = built.title;
  markSaved();
}

function buildItem(): ProjectSectionItem {
  return {
    sectionUuid: item.value.sectionUuid,
    title: normalizeHeadingText(item.value.title.trim()),
    summary: item.value.summary.trim(),
    humanReadableSlug: item.value.humanReadableSlug,
    publicId: item.value.publicId,
    isPrivate: item.value.isPrivate,
    periods: item.value.periods.length
      ? normalizePeriods(item.value.periods)
      : [],
    content: item.value.content ?? createEmptyContentFieldValue(),
    ...(item.value.bannerAssetUuid
      ? {
          bannerAssetUuid: item.value.bannerAssetUuid,
          bannerMedia: item.value.bannerMedia,
        }
      : {}),
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

function createInitialItem(data: ModalData): SectionDraft {
  return {
    sectionUuid: data.item?.sectionUuid,
    title: data.item?.title ?? '',
    summary: data.item?.summary ?? '',
    humanReadableSlug: data.item?.humanReadableSlug ?? '',
    publicId: data.item?.publicId ?? randomId(14),
    isPrivate: data.item?.isPrivate ?? false,
    periods: data.item?.periods ?? [],
    content: data.item?.content ?? null,
    bannerAssetUuid: data.item?.bannerAssetUuid,
    bannerMedia: data.item?.bannerMedia,
  };
}

function sectionLinkDescription(slug: string, publicId: string) {
  return buildProjectSectionUrl(
    props.modalData.projectHumanReadableSlug,
    props.modalData.projectPublicId,
    slug,
    publicId,
  );
}

/**
 * While a section that already exists on the site is open, the admin bar's
 * eye leads to its own public page rather than to the project's. It uses the
 * address the section was opened with: an unsaved edit of the slug has no
 * page yet.
 */
useRegisterAdminBarContextButton(
  computed(() => {
    const opened = props.modalData.item;
    if (!opened?.sectionUuid || !props.modalData.projectPublicId)
      return undefined;
    return {
      to: {
        href: sectionLinkDescription(opened.humanReadableSlug, opened.publicId),
        external: true,
      },
      icon: 'visibility',
      title: phrase.value.view_content_section,
    };
  }),
);

function removePeriod(index: number) {
  item.value.periods = item.value.periods.filter((_, i) => i !== index);
}

async function deleteItem() {
  if (!exists.value) return;
  const result = await openModal(projectContentItemDeleteModal, {
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
          :icon="entityTypeIcon('project-section')"
          :title="phrase.content_section"
          class="flex-1"
        />
        <div class="flex items-center gap-xs">
          <ModalHeaderButton
            v-if="exists"
            icon="delete"
            variant="delete"
            :label="phrase.delete_content_section"
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
          <FieldLabel required>{{ phrase.content_section_title }}</FieldLabel>
          <span :data-title-popup="phrase.content_section_private_hint">
            <FieldToggle v-model="item.isPrivate">
              <span class="inline-flex items-center gap-1">
                <Icon name="lock-close" />
                <span class="max-sm:hidden">
                  {{ phrase.content_section_private }}
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
        :entity-name="phrase.content_section"
        :link-description="sectionLinkDescription"
      />
      <Field>
        <FieldLabel>{{ phrase.content_section_summary }}</FieldLabel>
        <FieldTextarea v-model="item.summary" />
      </Field>
      <Field>
        <div class="flex items-center justify-between gap-sm">
          <FieldLabel>{{ phrase.section_periods }}</FieldLabel>
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
              labelled
              :confirm-label="
                editedPeriodIndex === undefined ? phrase.add : phrase.save
              "
              @confirm="confirmPeriod"
            />
          </div>
        </div>
        <div class="flex flex-wrap gap-xs">
          <span
            v-if="!item.periods.length"
            class="text-sm text-text-3 italic"
            data-section-periods-empty
          >
            {{
              hasBody
                ? phrase.section_undated_hint
                : phrase.section_needs_body_or_period
            }}
          </span>
          <DateRangeChip
            v-for="(period, index) in item.periods"
            :key="`${period.startDate}:${period.endDate}:${period.label}`"
            :period="period"
            removable
            editable
            @edit="openPeriod(index)"
            @remove="removePeriod(index)"
          />
        </div>
      </Field>

      <Field>
        <FieldLabel>{{ phrase.content_section_content }}</FieldLabel>
        <FieldContentEditor
          v-model="item.content"
          content-slot="project-section-body"
          :title-label="item.title.trim() || phrase.content_section_content"
          @saved="saveAfterContentEdit"
        />
      </Field>
      <ProfileMediaField
        v-model="bannerAssetUuid"
        v-model:media="item.bannerMedia"
        :title="phrase.content_section_banner"
        :description="phrase.content_section_banner_hint"
        profile="entity-banner"
        wide
        details-aside
        :usage-delta="bannerUsageDelta"
        data-section-banner
      />
    </div>
  </ModalContainer>
</template>
