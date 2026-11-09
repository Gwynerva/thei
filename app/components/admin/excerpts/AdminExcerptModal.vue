<script lang="ts" setup>
import {
  excerptSubjectLimit,
  type ExcerptItem,
} from '#layers/thei/shared/excerpt';
import { buildExcerptUrl } from '#layers/thei/shared/excerpt-url';
import { normalizeHeadingText } from '#layers/thei/shared/terminal-punctuation';
import {
  analyzeContentData,
  createEmptyContentFieldValue,
  isContentEmpty,
  type ContentFieldModelValue,
} from '#layers/thei/shared/content';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import FieldContentEditor from '#layers/thei/app/components/field/FieldContentEditor.vue';
import ModalContainer from '#layers/thei/app/modals/ModalContainer.vue';
import ModalTitle from '#layers/thei/app/modals/ModalTitle.vue';
import ModalHeaderButton from '#layers/thei/app/modals/ModalHeaderButton.vue';
import LinkField from '#layers/thei/app/pages/admin/components/LinkField.vue';
import { provideContentOwner } from '#layers/thei/app/composables/content-history/owner';
import type { FormNeed } from '#layers/thei/app/composables/form-needs';
import { adminExcerptDeleteModal } from './excerpt-modals';
import AdminExcerptAbout from './AdminExcerptAbout.vue';
import type { ExcerptsForm } from './excerpts-form';

/**
 * One excerpt of a diary entry, an event or a project, in a modal of its
 * own, built as a section's is: its title and whether it is private, its
 * address under its parent's, what it is about — one relation, with the
 * excerpt as its owner — its summary, its text, its banner, and what the
 * AI remembers of it. Handed over to the parent's form on Save, which saves
 * itself when nothing else is waiting; the modal stays open.
 */
type ModalData = {
  form: ExcerptsForm;
  item?: ExcerptItem;
  /** Hands the excerpt over to the parent's form. */
  onSave: (item: ExcerptItem) => void;
  /** Whether the excerpt the form holds — handed over last, or opened — is stored as it is. */
  stored: () => boolean;
  /** How many more times each file would be placed, were this excerpt saved as it stands. */
  usageDelta: (item: ExcerptItem) => Record<string, number>;
};
type Result = { type: 'deleted' };
type ExcerptDraft = Omit<ExcerptItem, 'content'> & {
  content: ContentFieldModelValue | null;
};

const emit = defineEmits<{ modalResult: [result: Result] }>();
const props = defineProps<{ modalData: ModalData }>();
const form = props.modalData.form;

/**
 * The content object is shared with the parent's form once handed over, and
 * a save stamps it with the time it was stored. The stamp is not an edit
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
/** Whether the parent's form holds this excerpt: opened from it, or saved once. */
const exists = ref(Boolean(props.modalData.item));
/** The title the excerpt is known by in the parent's form. */
const savedTitle = ref(props.modalData.item?.title ?? '');
const modalContainer =
  useTemplateRef<InstanceType<typeof ModalContainer>>('modalContainer');
const headerRow = useTemplateRef<HTMLElement>('headerRow');
const isSaved = computed(
  () => exists.value && !isDirty.value && props.modalData.stored(),
);
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
/**
 * What closes the excerpt to visitors beyond its own switch: what it is
 * about, while that is private or open by its link only. Said under the
 * switch, which keeps the owner's own choice for when that opens.
 */
const subjectLimit = computed(() =>
  excerptSubjectLimit(item.value.about?.access),
);
const subjectNote = computed(() => {
  const about = item.value.about;
  if (!about || !subjectLimit.value) return undefined;
  const name = entityListName(about);
  return subjectLimit.value === ProjectEventAccessLevel.Private
    ? phrase.value.excerpt_hidden_by_subject(name)
    : phrase.value.excerpt_link_only_by_subject(name);
});
/** Opened about nothing: what it was about was deleted. */
const orphan = computed(
  () =>
    Boolean(props.modalData.item?.excerptUuid) && !props.modalData.item?.about,
);
/** What stands for the excerpt beside what it is about: its banner, else its first picture. */
const ownerMedia = computed(
  () =>
    item.value.bannerMedia ??
    analyzeContentData(item.value.content?.data).preview.media,
);
/** The excerpt's parent, kept out of what it may be about. */
const parentEndpoint = computed(() => {
  const id = form.parentId();
  return id ? [{ type: form.parentType, id }] : [];
});

/**
 * What the excerpt still needs before it can be saved: its title, its text,
 * and the one thing it is about — an excerpt is always about something in
 * the archive. Its parent's form saves one whose subject was deleted; this
 * form asks for one again.
 */
const needs = useFormNeeds(
  () => {
    const list: FormNeed[] = [];
    if (!item.value.title.trim())
      list.push({ key: 'title', label: phrase.value.excerpt_title });
    if (!item.value.about)
      list.push({ key: 'about', label: phrase.value.excerpt_about });
    if (!hasBody.value)
      list.push({ key: 'body', label: phrase.value.excerpt_content });
    return list;
  },
  {
    root: () => modalContainer.value?.root,
    header: () => headerRow.value,
    ready: () => !exists.value || isDirty.value,
    save: handOver,
  },
);

useModalCloseGuard(
  () => !isDirty.value || window.confirm(phrase.value.unsaved_modal_confirm),
);
useBeforeUnloadGuard(() => isDirty.value);
// An excerpt not saved yet keeps its text's history under an address of
// its own; it is not offered drafts of other new ones.
provideContentOwner('excerpt', () => item.value.excerptUuid, {
  offersPendingDrafts: false,
});
provideEntityAi({
  ref: () =>
    item.value.excerptUuid ? `excerpt:${item.value.excerptUuid}` : undefined,
  form: () => item.value,
  version: () => form.saved(),
});

/**
 * Saving inside the content editor hands the excerpt over too, as the Save
 * button does; a brand-new excerpt waits for the button, and one the button
 * would refuse is not handed over either.
 */
function saveAfterContentEdit() {
  if (exists.value) needs.submit();
}

/** The save itself; a press or Ctrl+S comes to it through `needs.submit`. */
function handOver() {
  const built = buildItem();
  props.modalData.onSave(built);
  exists.value = true;
  savedTitle.value = built.title;
  // The field shows the title as it was handed over, its ending settled.
  item.value.title = built.title;
  markSaved();
}

function buildItem(): ExcerptItem {
  return {
    excerptUuid: item.value.excerptUuid,
    title: normalizeHeadingText(item.value.title.trim()),
    summary: item.value.summary.trim(),
    humanReadableSlug: item.value.humanReadableSlug,
    publicId: item.value.publicId,
    isPrivate: item.value.isPrivate,
    content: item.value.content ?? createEmptyContentFieldValue(),
    about: item.value.about,
    ...(item.value.bannerAssetUuid
      ? {
          bannerAssetUuid: item.value.bannerAssetUuid,
          bannerMedia: item.value.bannerMedia,
        }
      : {}),
  };
}

function createInitialItem(data: ModalData): ExcerptDraft {
  return {
    excerptUuid: data.item?.excerptUuid,
    title: data.item?.title ?? '',
    summary: data.item?.summary ?? '',
    humanReadableSlug: data.item?.humanReadableSlug ?? '',
    publicId: data.item?.publicId ?? randomId(14),
    isPrivate: data.item?.isPrivate ?? false,
    content: data.item?.content ?? null,
    about: data.item?.about ?? null,
    bannerAssetUuid: data.item?.bannerAssetUuid,
    bannerMedia: data.item?.bannerMedia,
  };
}

/** The address the link field describes: under the parent's, as the form holds it. */
function linkDescription(slug: string, publicId: string) {
  const parent = form.address();
  return parent ? buildExcerptUrl(parent, slug, publicId) : `…/${publicId}/`;
}

/**
 * The way to the excerpt's own page, for one that already exists on the
 * site: under the parent's address as last saved, at the address the
 * excerpt was opened with. An excerpt added here gets one once it is
 * opened again.
 */
const pageUrl = computed(() => {
  const opened = props.modalData.item;
  const parent = form.savedAddress();
  if (!opened?.excerptUuid || !parent) return;
  return buildExcerptUrl(parent, opened.humanReadableSlug, opened.publicId);
});

async function deleteItem() {
  if (!exists.value) return;
  const result = await openModal(adminExcerptDeleteModal, {
    title: savedTitle.value,
  });
  if (result.type === 'deleted') emit('modalResult', result);
}
</script>

<template>
  <ModalContainer ref="modalContainer" class="max-w-160">
    <template #header>
      <div ref="headerRow" class="flex items-center gap-sm p-sm">
        <ModalTitle
          :icon="entityTypeIcon('excerpt')"
          :title="phrase.excerpt"
          class="flex-1"
        />
        <div class="flex items-center gap-xs">
          <ModalHeaderButton
            v-if="pageUrl"
            icon="visibility"
            :label="phrase.view_content_section"
            :to="pageUrl"
          />
          <AiEntityButton />
          <ModalHeaderButton
            v-if="exists"
            icon="delete"
            variant="delete"
            :label="phrase.delete_excerpt"
            data-excerpt-delete
            @click="deleteItem"
          />
          <ModalHeaderButton
            icon="close"
            :label="phrase.close_modal"
            @click="closeModal"
          />
          <!-- «Saved» and its check only once the parent stored what was
               handed over. -->
          <ModalHeaderButton
            variant="accent"
            phone-icon="save"
            :phone-done="isSaved"
            :label="isSaved ? phrase.saved : phrase.save"
            :disabled="exists && !isDirty"
            :reason="needs.reason.value"
            data-excerpt-save
            @click="needs.submit()"
          >
            {{ isSaved ? phrase.saved : phrase.save }}
          </ModalHeaderButton>
        </div>
      </div>
      <HeaderErrorLine inset v-bind="needs.line.value" />
    </template>

    <div class="flex flex-col gap-md p-sm" data-excerpt-modal>
      <AiFormOffers />
      <Field ai="field:title" need="title">
        <div class="flex items-center justify-between gap-sm">
          <FieldLabel required>{{ phrase.excerpt_title }}</FieldLabel>
          <span :data-title-popup="phrase.content_section_private_hint">
            <FieldToggle v-model="item.isPrivate">
              <span class="inline-flex items-center gap-1">
                <Icon name="lock-close" />
                <span class="max-sm:hidden">{{ phrase.excerpt_private }}</span>
              </span>
            </FieldToggle>
          </span>
        </div>
        <FieldInput v-model="item.title" autocomplete="off" />
        <p
          v-if="subjectNote"
          class="flex items-center gap-1 text-sm text-text-3"
          data-excerpt-subject-access
        >
          <Icon
            :name="
              subjectLimit === ProjectEventAccessLevel.Private
                ? 'lock-close'
                : 'link'
            "
            aria-hidden="true"
          />
          {{ subjectNote }}
        </p>
      </Field>
      <LinkField
        v-model:title="item.title"
        v-model:human-readable-slug="item.humanReadableSlug"
        v-model:public-id="item.publicId"
        :entity-name="phrase.excerpt"
        :link-description="linkDescription"
      />
      <!-- What the excerpt is about: one project, event or diary entry,
           its parent kept out of the picker. -->
      <AdminExcerptAbout
        v-model="item.about"
        :owner-title="item.title.trim() || phrase.excerpt"
        :owner-media="ownerMedia"
        :text="item.content?.data"
        :exclude="parentEndpoint"
        :orphan
      />
      <Field ai="field:summary">
        <FieldLabel>{{ phrase.excerpt_summary }}</FieldLabel>
        <FieldTextarea v-model="item.summary" />
      </Field>
      <Field need="body">
        <FieldLabel required>{{ phrase.excerpt_content }}</FieldLabel>
        <FieldContentEditor
          v-model="item.content"
          content-slot="excerpt-body"
          :title-label="item.title.trim() || phrase.excerpt_content"
          @saved="saveAfterContentEdit"
        />
      </Field>
      <ProfileMediaField
        v-model="bannerAssetUuid"
        v-model:media="item.bannerMedia"
        :title="phrase.excerpt_banner"
        :description="phrase.excerpt_banner_hint"
        profile="entity-banner"
        wide
        details-aside
        :usage-delta="bannerUsageDelta"
        data-excerpt-banner
      />
      <AiMemoryBlock />
    </div>
  </ModalContainer>
</template>
