<script lang="ts" setup>
import type {
  TagEditData,
  TagItem,
  TagSaveResponse,
  TagUsageStats,
} from '#layers/thei/shared/tag';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import AssetTile from '#layers/thei/app/components/AssetTile.vue';
import LinkField from '../../components/LinkField.vue';
import { useSingleMediaAsset } from '#layers/thei/app/composables/single-media-asset';
import { singleAssetUsageDelta } from '#layers/thei/app/composables/single-media-asset-state';
import { tagDeleteModal } from './tag-delete-modal';

const { tagUuid } = defineProps<{ tagUuid?: string }>();
const isEdit = computed(() => Boolean(tagUuid));
const data = ref<TagEditData>({
  title: '',
  slug: '',
  publicId: randomId(14),
  description: '',
});
const iconMedia = ref<MediaDescriptor>();
const iconSize = ref<number>();
const savedIconAssetUuid = ref<string>();
const usageStats = ref<TagUsageStats>({ total: 0, projects: 0, events: 0 });
const saved = ref('');
const saving = ref(false);
const error = ref<string>();
const publicIdError = ref<string>();

if (tagUuid) {
  const response = await useRequestFetch()<
    TagItem & { usageStats: TagUsageStats }
  >(`/api/admin/tags/${tagUuid}/`);
  data.value = {
    title: response.title,
    slug: response.slug,
    publicId: response.publicId,
    description: response.description ?? '',
    accentColor: response.accentColor,
    iconAssetUuid: response.iconAssetUuid,
  };
  iconMedia.value = response.iconMedia;
  iconSize.value = response.iconAssetSize;
  savedIconAssetUuid.value = response.iconAssetUuid;
  usageStats.value = response.usageStats;
}
saved.value = JSON.stringify(data.value);
const dirty = computed(() => JSON.stringify(data.value) !== saved.value);
watch(
  () => data.value.publicId,
  () => {
    publicIdError.value = undefined;
  },
);

const iconAsset = useSingleMediaAsset({
  uploadProfile: 'tag-icon',
  asideTitle: () => phrase.value.tag_icon,
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

async function save() {
  if (saving.value) return;
  saving.value = true;
  error.value = undefined;
  try {
    const result = await $fetch<TagSaveResponse>(
      tagUuid ? `/api/admin/tags/${tagUuid}/` : '/api/admin/tags/',
      { method: tagUuid ? 'PUT' : 'POST', body: data.value },
    );
    if (result.type === 'error') {
      if (result.code === 'public-id-taken') {
        publicIdError.value = result.message;
        return;
      }
      error.value = result.message;
      return;
    }
    saved.value = JSON.stringify(data.value);
    savedIconAssetUuid.value = data.value.iconAssetUuid;
    await refreshNuxtData('admin-tag-count');
    if (!tagUuid)
      await navigateTo(`/admin/tags/edit/${result.tagUuid}/`, {
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
  if (!tagUuid) return;

  error.value = undefined;
  try {
    const result = await openModal(tagDeleteModal, {
      tagUuid,
      tagTitle: data.value.title,
      usageStats: usageStats.value,
    });
    if (result.type !== 'deleted') return;

    await refreshNuxtData('admin-tag-count');
    await navigateTo('/admin/tags/');
  } catch (caught) {
    error.value =
      caught instanceof Error
        ? caught.message
        : phrase.value.failed_to_fetch_data;
  }
}

await useAdminTabTitle(
  computed(() => (isEdit.value ? phrase.value.edit_tag : phrase.value.new_tag)),
);
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)" :error="error">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="tag" />
        <span class="truncate">{{
          isEdit ? phrase.edit_tag : phrase.new_tag
        }}</span>
      </div>
      <div class="flex gap-xs">
        <Button
          v-if="isEdit"
          variant="delete"
          :aria-label="phrase.delete"
          :data-title-popup="phrase.delete"
          @click="remove"
        >
          <Icon name="delete" />
        </Button>
        <Button
          class="font-semibold"
          :disabled="
            saving ||
            !data.title.trim() ||
            !data.slug.trim() ||
            !data.publicId.trim() ||
            (isEdit && !dirty)
          "
          @click="save"
        >
          <Icon v-if="saving" name="loading" class="mr-xs" />
          {{ isEdit ? (dirty ? phrase.save : phrase.saved) : phrase.create }}
        </Button>
      </div>
    </div>
  </StickyGlassHeader>
  <div class="m-auto w-(--width-wide) max-w-full px-window py-lg">
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <div class="flex flex-col gap-md sm:flex-row">
        <Field class="min-w-0 flex-1">
          <FieldLabel required>{{ phrase.tag_title }}</FieldLabel>
          <FieldInput
            v-model="data.title"
            type="text"
            autocomplete="off"
            spellcheck="false"
            maxlength="100"
            required
          />
          <FieldHint>{{ phrase.tag_title_hint }}</FieldHint>
        </Field>

        <Field class="min-w-0 flex-1">
          <FieldLabel>{{ phrase.tag_icon }}</FieldLabel>
          <div class="flex items-center gap-sm">
            <AssetTile
              :media="iconMedia"
              :size="iconSize"
              :aria-label="phrase.tag_icon"
              class="size-20 shrink-0 cursor-pointer"
              @click="iconAsset.open"
            />
            <FieldHint>{{ phrase.tag_icon_hint }}</FieldHint>
          </div>
        </Field>
      </div>

      <Field>
        <FieldLabel>{{ phrase.tag_description }}</FieldLabel>
        <FieldTextarea
          v-model="data.description"
          autocomplete="off"
          spellcheck="false"
          maxlength="2000"
        />
        <FieldHint>{{ phrase.tag_description_hint }}</FieldHint>
      </Field>

      <LinkField
        v-model:title="data.title"
        v-model:human-readable-slug="data.slug"
        v-model:public-id="data.publicId"
        :entity-name="phrase.tag"
        :link-description="phrase.tag_link_example"
        :public-id-error="publicIdError"
      />

      <div class="flex flex-col gap-md sm:flex-row">
        <Field class="min-w-0 flex-1">
          <FieldLabel>{{ phrase.tag_color }}</FieldLabel>
          <div class="flex items-center gap-sm">
            <input
              type="color"
              :value="data.accentColor ?? '#777777'"
              class="size-10 cursor-pointer rounded-normal border
                border-border-1 bg-bg-1 p-1"
              @input="
                data.accentColor = ($event.target as HTMLInputElement).value
              "
            />
            <code v-if="data.accentColor" class="text-sm text-text-2">{{
              data.accentColor
            }}</code>
            <button
              v-if="data.accentColor"
              type="button"
              class="flex size-10 cursor-pointer items-center justify-center
                rounded-normal bg-bg-3 text-text-2 transition hocus:bg-bg-error
                hocus:text-text-error"
              :aria-label="phrase.delete"
              :data-title-popup="phrase.delete"
              @click="data.accentColor = undefined"
            >
              <Icon name="delete" />
            </button>
          </div>
          <FieldHint>{{ phrase.tag_color_hint }}</FieldHint>
        </Field>

        <Field v-if="isEdit" class="min-w-0 flex-1">
          <FieldLabel>{{ phrase.tag_usage }}</FieldLabel>
          <div
            class="flex min-h-10 flex-wrap items-center gap-xs text-text-2"
            :aria-label="
              phrase.tag_usage_summary(usageStats.projects, usageStats.events)
            "
          >
            <span class="flex items-center gap-xs">
              <Icon name="project" />
              <span>{{ phrase.x_projects(usageStats.projects) }}</span>
            </span>
            <span aria-hidden="true" class="text-text-3">·</span>
            <span class="flex items-center gap-xs">
              <Icon name="event" />
              <span>{{ phrase.x_events(usageStats.events) }}</span>
            </span>
          </div>
          <FieldHint>{{ phrase.tag_delete_hint }}</FieldHint>
        </Field>
      </div>
    </Box>
  </div>
</template>
