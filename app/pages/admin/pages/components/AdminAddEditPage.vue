<script lang="ts" setup>
import { normalizeHeadingText } from '#layers/thei/shared/terminal-punctuation';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { isContentEmpty } from '#layers/thei/shared/content';
import type { PageEditData } from '#layers/thei/shared/page';
import type { FormNeed } from '#layers/thei/app/composables/form-needs';
import type {
  PageGetResponse,
  PageSaveResponse,
} from '#layers/thei/shared/api/page';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import {
  normalizePageSlug,
  pageSlugIsTaken,
  pageSlugIsValid,
} from '#layers/thei/shared/admin/page';
import SlugInput from '../../components/SlugInput.vue';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import AssetTile from '#layers/thei/app/components/AssetTile.vue';
import { useSingleMediaAsset } from '#layers/thei/app/composables/single-media-asset';
import { singleAssetUsageDelta } from '#layers/thei/app/composables/single-media-asset-state';
import { pageDeleteModal } from './page-delete-modal';
import { provideContentOwner } from '#layers/thei/app/composables/content-history/owner';

const { pageUuid } = defineProps<{ pageUuid?: string }>();
const isEdit = computed(() => Boolean(pageUuid));
provideContentOwner('page', () => pageUuid);
const data = ref<PageEditData>(emptyData());
const iconMedia = ref<MediaDescriptor>();
const iconSize = ref<number>();
const savedIconAssetUuid = ref<string>();
const registeredSlugs = ref<string[]>([]);
const initialSlug = ref('');
const slugSynchronized = ref(true);
const savedSnapshot = ref(JSON.stringify(payload()));
// Begun from the quick search: the query is the title, as if typed.
if (!isEdit.value && titleFromQuery()) data.value.title = titleFromQuery();
/**
 * When the entity last changed, as the form read it. A save names it, and
 * one over a change made elsewhere since — another tab, an AI client — is
 * refused rather than written over it.
 */
const formVersion = ref<number>();
provideEntityAi({
  ref: () => (pageUuid ? `page:${pageUuid}` : undefined),
  form: () => data.value,
  version: () => formVersion.value,
});
const saving = ref(false);
const error = ref<string>();
const serverSlugError = ref<string>();

const registered = useRequiredResource(
  await useFetch<string[]>('/api/admin/pages/slugs'),
);
registeredSlugs.value = [...registered.value];

if (pageUuid) {
  const response = useRequiredResource(
    await useFetch<PageGetResponse>(
      () => `/api/admin/pages/${encodeURIComponent(pageUuid!)}`,
    ),
  );
  watch(
    response,
    (response) => {
      data.value = {
        title: response.title,
        summary: response.summary,
        slug: response.slug,
        access: response.access,
        iconAssetUuid: response.iconAssetUuid,
        content: response.content,
        reminder: response.reminder,
        synonyms: response.synonyms,
        notes: response.notes ?? null,
      };
      iconMedia.value = response.iconMedia;
      iconSize.value = response.iconAssetSize;
      savedIconAssetUuid.value = response.iconAssetUuid;
      initialSlug.value = response.slug;
      // As on the other edit pages: the chain stays whole while the slug is
      // still the one the title gives.
      slugSynchronized.value =
        response.slug === language.value.slugify(response.title);
      markSaved();
      formVersion.value = response.version;
    },
    { immediate: true },
  );
  if (pageUuid !== response.value.pageUuid)
    await navigateTo(`/admin/pages/${response.value.pageUuid}/edit/`, {
      replace: true,
    });
}

/**
 * Saving inside the content editor saves the whole entity too, but only when
 * the content was the single thing that changed since the last save. Anything
 * else waiting to be saved stays the person's own decision, made with the
 * editor closed and the whole form in front of them.
 */
/** Every place this form keeps authored content, at any depth. */
const CONTENT_FIELDS = ['content', 'descriptionContent', 'notes'];

function saveAfterContentEdit() {
  if (!canSave.value) return;
  if (!changedOnlyIn(payload(), savedSnapshot.value, CONTENT_FIELDS)) return;
  void save();
}

const synonymsModel = computed({
  get: () => data.value.synonyms ?? [],
  set: (value: string[]) => {
    data.value.synonyms = value;
  },
});
const reminderModel = computed({
  get: () => data.value.reminder ?? '',
  set: (value: string) => {
    data.value.reminder = value;
  },
});
const notesModel = computed({
  get: () => data.value.notes ?? null,
  set: (value) => {
    data.value.notes = value;
  },
});

const dirty = computed(() => JSON.stringify(payload()) !== savedSnapshot.value);
useLeaveGuard({ dirty: () => dirty.value });
const slugInvalid = computed(
  () => Boolean(data.value.slug) && !pageSlugIsValid(data.value.slug),
);
const slugTaken = computed(() =>
  pageSlugIsTaken(
    data.value.slug,
    registeredSlugs.value,
    initialSlug.value || undefined,
  ),
);
/** What the page still needs before it can be saved, in the form's order. */
const needs = useFormNeeds(() => {
  const page = data.value;
  const list: FormNeed[] = [];
  if (!page.title.trim())
    list.push({ key: 'title', label: phrase.value.page_title });
  if (!page.access)
    list.push({ key: 'access', label: phrase.value.page_access });
  if (!page.summary.trim())
    list.push({ key: 'summary', label: phrase.value.page_summary });
  const slug = phrase.value.page_slug;
  if (!page.slug.trim()) list.push({ key: 'slug', label: slug });
  else if (slugInvalid.value)
    list.push({
      key: 'slug',
      label: slug,
      problem: phrase.value.page_slug_invalid,
    });
  else if (slugTaken.value)
    list.push({
      key: 'slug',
      label: slug,
      problem: phrase.value.page_slug_already_taken,
    });
  if (isContentEmpty(page.content?.data))
    list.push({ key: 'content', label: phrase.value.page_content });
  return list;
});
const canSave = computed(
  () => !saving.value && !needs.blocked.value && (!isEdit.value || dirty.value),
);

// The public page lives at the saved address, not at whatever is being typed.
useRegisterAdminBarContextButton(
  computed(() => {
    if (!isEdit.value) return undefined;
    const { slug } = JSON.parse(savedSnapshot.value) as PageEditData;
    return {
      to: { href: buildPageUrl(slug), external: true },
      icon: 'visibility',
      title: phrase.value.view_page,
    };
  }),
);

const iconAsset = useSingleMediaAsset({
  uploadProfile: 'project-icon',
  asideTitle: () => phrase.value.page_icon,
  getAssetUuid: () => data.value.iconAssetUuid,
  setAssetUuid: (assetUuid) => {
    data.value.iconAssetUuid = assetUuid;
  },
  media: iconMedia,
  size: iconSize,
  usageDelta: () =>
    singleAssetUsageDelta(data.value.iconAssetUuid, savedIconAssetUuid.value),
  onError: (caught) => {
    console.error(caught);
    error.value =
      caught instanceof Error
        ? caught.message
        : phrase.value.failed_to_fetch_data;
  },
});

watch(
  () => data.value.slug,
  () => {
    serverSlugError.value = undefined;
  },
);

async function save() {
  if (saving.value || (isEdit.value && !dirty.value)) return;
  // Asked by a press or Ctrl+S, a save it cannot make says why.
  if (needs.blocked.value) return needs.ask();
  saving.value = true;
  error.value = undefined;
  serverSlugError.value = undefined;
  try {
    const result = await $fetch<PageSaveResponse>(
      isEdit.value ? `/api/admin/pages/${pageUuid}` : '/api/admin/pages',
      {
        method: isEdit.value ? 'PUT' : 'POST',
        body: { ...payload(), version: formVersion.value },
      },
    );
    if (result.type === 'error') {
      if (result.code === 'slug-taken') serverSlugError.value = result.message;
      else error.value = result.message;
      return;
    }
    formVersion.value = result.version;
    const previousSlug = initialSlug.value;
    // The title as the server stored it, its ending settled.
    data.value.title = normalizeHeadingText(data.value.title.trim());
    data.value.slug = result.slug;
    savedIconAssetUuid.value = data.value.iconAssetUuid;
    registeredSlugs.value = registeredSlugs.value.filter(
      (slug) => normalizePageSlug(slug) !== normalizePageSlug(previousSlug),
    );
    if (!registeredSlugs.value.includes(result.slug))
      registeredSlugs.value.push(result.slug);
    initialSlug.value = result.slug;
    stampSavedContent(data.value, savedSnapshot.value, CONTENT_FIELDS);
    markSaved();
    await refreshNuxtData('admin-bar');
    if (!isEdit.value)
      await navigateTo(`/admin/pages/${result.pageUuid}/edit/`, {
        external: true,
      });
  } catch (caught) {
    error.value =
      caught instanceof Error
        ? caught.message
        : phrase.value.failed_to_fetch_data;
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!pageUuid) return;
  const result = await openModal(pageDeleteModal, {
    pageUuid,
    pageTitle: data.value.title,
  });
  if (result.type !== 'deleted') return;
  markSaved();
  await refreshNuxtData('admin-bar');
  await navigateTo('/admin/pages/');
}

function payload(): PageEditData {
  return {
    title: data.value.title,
    summary: data.value.summary,
    slug: data.value.slug,
    access: data.value.access,
    iconAssetUuid: data.value.iconAssetUuid,
    content: data.value.content,
    reminder: data.value.reminder,
    synonyms: data.value.synonyms,
    notes: data.value.notes,
  };
}

function markSaved() {
  savedSnapshot.value = JSON.stringify(payload());
}

function emptyData(): PageEditData {
  return {
    title: '',
    summary: '',
    slug: '',
    access: '',
    content: null,
    reminder: '',
    synonyms: [],
    notes: null,
  };
}

// Ctrl+S on a page not ready to save says what it still needs.
useSaveShortcut(save, {
  canSave: () => !saving.value && (!isEdit.value || dirty.value),
});
await useAdminTabTitle(
  computed(() =>
    isEdit.value ? phrase.value.edit_page : phrase.value.new_page,
  ),
);
</script>

<template>
  <StickyGlassHeader
    width="var(--width-wide)"
    :error="error ?? needs.line.value"
    :error-again="needs.asks.value"
  >
    <div class="flex items-center justify-between gap-xs py-xs">
      <div
        class="flex min-w-0 items-center gap-xs text-lg font-bold sm:text-xl"
      >
        <Icon name="page" />
        <span class="truncate">{{
          isEdit ? phrase.edit_page : phrase.new_page
        }}</span>
      </div>
      <div class="flex items-center gap-xs">
        <AiEntityButton />
        <Button
          v-if="isEdit"
          variant="delete"
          size="icon"
          class="pointer-coarse:size-11"
          :aria-label="phrase.delete"
          :data-title-popup="phrase.delete"
          @click="remove"
        >
          <Icon name="delete" />
        </Button>
        <AdminSaveButton
          :label="isEdit ? (dirty ? phrase.save : phrase.saved) : phrase.create"
          :saving
          :done="isEdit && !dirty"
          :disabled="saving || (isEdit && !dirty)"
          :reason="needs.reason.value"
          @click="save"
        />
      </div>
    </div>
  </StickyGlassHeader>

  <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <AiFormOffers />
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <div class="flex flex-col gap-md sm:flex-row">
        <Field ai="field:title" need="title" class="min-w-0 flex-1">
          <FieldLabel required>{{ phrase.page_title }}</FieldLabel>
          <FieldInput
            v-model="data.title"
            type="text"
            autocomplete="off"
            spellcheck="true"
            required
          />
          <FieldHint>{{ phrase.page_title_hint }}</FieldHint>
        </Field>

        <Field ai="access" need="access" class="min-w-50">
          <FieldLabel required>{{ phrase.page_access }}</FieldLabel>
          <FieldOptions
            v-model="data.access"
            direction="row"
            :options="{
              [ProjectEventAccessLevel.Public]: {
                icon: 'lock-open',
                title: phrase.public,
              },
              [ProjectEventAccessLevel.LinkOnly]: {
                icon: 'lock-partial',
                title: phrase.link_only,
              },
              [ProjectEventAccessLevel.Private]: {
                icon: 'lock-close',
                title: phrase.private,
              },
            }"
          />
        </Field>
      </div>

      <Field ai="field:summary" need="summary">
        <FieldLabel required>{{ phrase.page_summary }}</FieldLabel>
        <FieldTextarea
          v-model="data.summary"
          autocomplete="off"
          spellcheck="true"
          required
        />
        <FieldHint>{{ phrase.page_summary_hint }}</FieldHint>
      </Field>

      <div class="flex flex-col gap-md sm:flex-row">
        <Field need="slug" class="min-w-0 flex-1">
          <FieldLabel required>{{ phrase.page_slug }}</FieldLabel>
          <SlugInput
            v-model="data.slug"
            v-model:synchronized="slugSynchronized"
            :source="data.title"
            :label="phrase.page_slug"
            required
          />
          <FieldHint>{{ phrase.page_slug_hint }}</FieldHint>
          <FieldHint v-if="slugInvalid" class="text-text-error">
            {{ phrase.page_slug_invalid }}
          </FieldHint>
          <FieldHint
            v-else-if="slugTaken || serverSlugError"
            class="text-text-error"
          >
            {{ serverSlugError || phrase.page_slug_already_taken }}
          </FieldHint>
          <FieldHint v-else>{{
            phrase.page_link_example(data.slug)
          }}</FieldHint>
        </Field>

        <Field class="min-w-0 flex-1">
          <FieldLabel>{{ phrase.page_icon }}</FieldLabel>
          <div class="flex items-center gap-sm">
            <AssetTile
              :media="iconMedia"
              :overlay="{
                size: iconSize,
                showSize: iconSize != null,
                editable: true,
              }"
              :aria-label="phrase.page_icon"
              class="size-20 shrink-0 cursor-pointer"
              @click="iconAsset.open"
            />
            <FieldHint>{{ phrase.page_icon_hint }}</FieldHint>
          </div>
        </Field>
      </div>

      <Field need="content">
        <FieldLabel required>{{ phrase.page_content }}</FieldLabel>
        <FieldContentEditor
          v-model="data.content"
          content-slot="page-body"
          :title-label="phrase.page_content"
          @saved="saveAfterContentEdit()"
        />
        <FieldHint>{{ phrase.page_content_hint }}</FieldHint>
      </Field>
    </Box>

    <AdminShareLinks
      v-if="pageUuid"
      entity-type="page"
      :entity-uuid="pageUuid"
    />
    <AiMemoryBlock />
    <AdminNotesBlock
      v-model:reminder="reminderModel"
      v-model:notes="notesModel"
      @notes-saved="saveAfterContentEdit()"
    />
    <!-- The other names: the least needed setting, so the last one. -->
    <Box class="p-sm sm:p-md">
      <FieldSynonyms
        v-model="synonymsModel"
        ai="field:synonyms"
        :title="data.title"
      />
    </Box>
  </div>
</template>
