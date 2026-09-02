<script lang="ts" setup>
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { isContentEmpty } from '#layers/thei/shared/content';
import type { PageEditData } from '#layers/thei/shared/page';
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
import { buildPageUrl } from '#layers/thei/shared/page-url';
import AssetTile from '#layers/thei/app/components/AssetTile.vue';
import { useSingleMediaAsset } from '#layers/thei/app/composables/single-media-asset';
import { singleAssetUsageDelta } from '#layers/thei/app/composables/single-media-asset-state';
import { pageDeleteModal } from './page-delete-modal';

const { pageUuid } = defineProps<{ pageUuid?: string }>();
const isEdit = computed(() => Boolean(pageUuid));
const data = ref<PageEditData>(emptyData());
const iconMedia = ref<MediaDescriptor>();
const iconSize = ref<number>();
const savedIconAssetUuid = ref<string>();
const registeredSlugs = ref<string[]>([]);
const initialSlug = ref('');
const slugSynchronized = ref(true);
const savedSnapshot = ref(JSON.stringify(payload()));
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
      };
      iconMedia.value = response.iconMedia;
      iconSize.value = response.iconAssetSize;
      savedIconAssetUuid.value = response.iconAssetUuid;
      initialSlug.value = response.slug;
      slugSynchronized.value = false;
      markSaved();
    },
    { immediate: true },
  );
  if (pageUuid !== response.value.pageUuid)
    await navigateTo(`/admin/pages/${response.value.pageUuid}/edit/`, {
      replace: true,
    });
}

const dirty = computed(() => JSON.stringify(payload()) !== savedSnapshot.value);
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
const canSave = computed(
  () =>
    !saving.value &&
    Boolean(
      data.value.title.trim() &&
      data.value.summary.trim() &&
      data.value.slug.trim() &&
      data.value.access &&
      !isContentEmpty(data.value.content?.data) &&
      !slugInvalid.value &&
      !slugTaken.value,
    ) &&
    (!isEdit.value || dirty.value),
);

useRegisterAdminBarContextButton(
  computed(() =>
    isEdit.value
      ? {
          to: { href: buildPageUrl(data.value.slug), external: true },
          icon: 'visibility',
          title: phrase.value.view_page,
        }
      : undefined,
  ),
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
  () => data.value.title,
  (title) => {
    if (slugSynchronized.value) data.value.slug = language.value.slugify(title);
  },
);
watch(
  () => data.value.slug,
  () => {
    serverSlugError.value = undefined;
  },
);

function updateSlug(value: string | undefined) {
  slugSynchronized.value = false;
  data.value.slug = normalizePageSlug(value ?? '');
}

function synchronizeSlug() {
  slugSynchronized.value = true;
  data.value.slug = language.value.slugify(data.value.title);
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  error.value = undefined;
  serverSlugError.value = undefined;
  try {
    const result = await $fetch<PageSaveResponse>(
      isEdit.value ? `/api/admin/pages/${pageUuid}` : '/api/admin/pages',
      { method: isEdit.value ? 'PUT' : 'POST', body: payload() },
    );
    if (result.type === 'error') {
      if (result.code === 'slug-taken') serverSlugError.value = result.message;
      else error.value = result.message;
      return;
    }
    const previousSlug = initialSlug.value;
    data.value.slug = result.slug;
    savedIconAssetUuid.value = data.value.iconAssetUuid;
    registeredSlugs.value = registeredSlugs.value.filter(
      (slug) => normalizePageSlug(slug) !== normalizePageSlug(previousSlug),
    );
    if (!registeredSlugs.value.includes(result.slug))
      registeredSlugs.value.push(result.slug);
    initialSlug.value = result.slug;
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
  };
}

useSaveShortcut(save, { canSave });
await useAdminTabTitle(
  computed(() =>
    isEdit.value ? phrase.value.edit_page : phrase.value.new_page,
  ),
);
onBeforeRouteLeave(() => {
  if (interceptModalNavigation()) return false;
  if (dirty.value) return window.confirm(phrase.value.unsaved_changes_confirm);
});
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)" :error="error">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="page" />
        <span class="truncate">{{
          isEdit ? phrase.edit_page : phrase.new_page
        }}</span>
      </div>
      <div class="flex items-center gap-xs">
        <Button
          v-if="isEdit"
          variant="delete"
          :aria-label="phrase.delete"
          :data-title-popup="phrase.delete"
          @click="remove"
        >
          <Icon name="delete" />
        </Button>
        <Button class="font-semibold" :disabled="!canSave" @click="save">
          <Icon v-if="saving" name="loading" class="mr-xs" />
          {{ isEdit ? (dirty ? phrase.save : phrase.saved) : phrase.create }}
        </Button>
      </div>
    </div>
  </StickyGlassHeader>

  <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <div class="flex flex-col gap-md sm:flex-row">
        <Field class="min-w-0 flex-1">
          <FieldLabel required>{{ phrase.page_title }}</FieldLabel>
          <FieldInput
            v-model="data.title"
            type="text"
            autocomplete="off"
            spellcheck="false"
            required
          />
          <FieldHint>{{ phrase.page_title_hint }}</FieldHint>
        </Field>

        <Field class="min-w-50">
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

      <Field>
        <FieldLabel required>{{ phrase.page_summary }}</FieldLabel>
        <FieldTextarea
          v-model="data.summary"
          autocomplete="off"
          spellcheck="false"
          required
        />
        <FieldHint>{{ phrase.page_summary_hint }}</FieldHint>
      </Field>

      <div class="flex flex-col gap-md sm:flex-row">
        <Field class="min-w-0 flex-1">
          <FieldLabel required>{{ phrase.page_slug }}</FieldLabel>
          <div class="flex gap-xs">
            <FieldInput
              :model-value="data.slug"
              type="text"
              autocomplete="off"
              spellcheck="false"
              required
              @update:model-value="updateSlug"
            />
            <Button
              variant="secondary"
              :aria-label="phrase.enable_url_synchronization"
              :data-title-popup="phrase.enable_url_synchronization"
              @click="synchronizeSlug"
            >
              <Icon name="refresh" />
            </Button>
          </div>
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

      <Field>
        <FieldLabel required>{{ phrase.page_content }}</FieldLabel>
        <FieldContentEditor
          v-model="data.content"
          :title-label="phrase.page_content"
        />
        <FieldHint>{{ phrase.page_content_hint }}</FieldHint>
      </Field>
    </Box>
  </div>
</template>
