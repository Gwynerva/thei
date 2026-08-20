<script lang="ts" setup>
import {
  launchAssetEditor,
  launchAssetWizard,
  mapAssetVariantToReplaceResult,
} from '#layers/thei/app/composables/asset-wizard';
import type {
  AssetVariantInfo,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import {
  imageExtensionProfile,
  anyFileExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';
import {
  DEFAULT_PROJECT_ACTION,
  normalizeProjectActionBackgroundRepeat,
  type ProjectActionEditData,
} from '#layers/thei/shared/project-action';
import type { ExternalLink } from '#layers/thei/shared/external-link';
import { projectAssetUsageDelta } from '#layers/thei/shared/admin/project';
import { assetSourceName } from '#layers/thei/shared/asset';
import { assetDetailsModal } from '#layers/thei/app/modals/asset-details/modal';
import { useSingleMediaAsset } from '#layers/thei/app/composables/single-media-asset';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import {
  projectDataInjectionKey,
  savedProjectDataInjectionKey,
  actionIconMediaKey,
  actionIconSizeKey,
  actionBackgroundMediaKey,
  actionBackgroundSizeKey,
  actionFileUrlKey,
  actionFileMediaKey,
  actionFileExtensionKey,
  actionFileSizeKey,
  actionFaviconMediaKey,
} from '../composables';

const projectData = inject(projectDataInjectionKey)!;
const savedProjectData = inject(savedProjectDataInjectionKey)!;
const iconMedia = inject(actionIconMediaKey)!;
const iconSize = inject(actionIconSizeKey)!;
const backgroundMedia = inject(actionBackgroundMediaKey)!;
const backgroundAssetSize = inject(actionBackgroundSizeKey)!;
const fileUrl = inject(actionFileUrlKey)!;
const fileMedia = inject(actionFileMediaKey)!;
const fileExtension = inject(actionFileExtensionKey)!;
const fileSize = inject(actionFileSizeKey)!;
const faviconMedia = inject(actionFaviconMediaKey)!;
const loadingFavicon = ref(false);
const faviconResolved = ref(false);
const externalLinkPreview = ref<ExternalLink>();
let faviconTimer: ReturnType<typeof setTimeout> | undefined;
let faviconRequestId = 0;

const action = computed<ProjectActionEditData>({
  get: () => projectData.value.action ?? { ...DEFAULT_PROJECT_ACTION },
  set: (value) => {
    projectData.value.action = value;
  },
});
const hasActionText = computed(() => action.value.text.trim().length > 0);
const hasSiteIcon = computed(
  () =>
    action.value.target === 'external-link' &&
    externalLinkPreview.value?.hasFavicon === true &&
    faviconMedia.value != null,
);
const previewUsesFavicon = computed(
  () => action.value.iconMode === 'favicon' && hasSiteIcon.value,
);
const previewBackgroundMode = computed(() => {
  const mode = action.value.backgroundMode;
  if (
    (mode === 'icon-gradient' &&
      (action.value.iconMode !== 'asset' ||
        iconMedia.value?.accentHue === undefined)) ||
    (mode === 'file-gradient' &&
      (action.value.target !== 'file' ||
        fileMedia.value?.accentHue === undefined)) ||
    (mode === 'link-gradient' &&
      (action.value.target !== 'external-link' ||
        !hasSiteIcon.value ||
        faviconMedia.value?.accentHue === undefined))
  ) {
    return 'standard-gradient';
  }
  return mode;
});

watch(
  hasActionText,
  (enabled) => {
    action.value.enabled = enabled;
  },
  { immediate: true },
);
const previewHref = computed(() => {
  if (action.value.target === 'file') return fileUrl.value;
  try {
    const url = new URL(action.value.externalUrl ?? '');
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
});

const usageDelta = () =>
  projectAssetUsageDelta(projectData.value, savedProjectData.value);
const iconSlot = useSingleMediaAsset({
  uploadProfile: 'project-action-icon',
  accept: [imageExtensionProfile],
  asideTitle: () => phrase.value.project_action_icon,
  getAssetUuid: () => action.value.iconAssetUuid,
  setAssetUuid: (assetUuid) => {
    action.value.iconAssetUuid = assetUuid;
    if (assetUuid) action.value.iconMode = 'asset';
    else if (action.value.iconMode === 'asset')
      action.value.iconMode = 'fallback';
    if (!assetUuid && action.value.backgroundMode === 'icon-gradient')
      action.value.backgroundMode = 'standard-gradient';
  },
  media: iconMedia,
  size: iconSize,
  usageDelta,
});
const backgroundSlot = useSingleMediaAsset({
  uploadProfile: 'project-action-background',
  accept: [imageExtensionProfile],
  asideTitle: () => phrase.value.project_action_background,
  getAssetUuid: () => action.value.backgroundAssetUuid,
  setAssetUuid: (assetUuid) => {
    action.value.backgroundAssetUuid = assetUuid;
  },
  media: backgroundMedia,
  size: backgroundAssetSize,
  usageDelta,
});

watch(
  () => action.value.target,
  (target) => {
    if (target === 'file') {
      action.value.externalUrl = undefined;
      faviconMedia.value = undefined;
      externalLinkPreview.value = undefined;
      clearTimeout(faviconTimer);
      action.value.iconMode = action.value.iconAssetUuid ? 'asset' : 'fallback';
      if (action.value.backgroundMode === 'link-gradient')
        action.value.backgroundMode = 'standard-gradient';
    } else {
      clearFile();
      if (action.value.backgroundMode === 'file-gradient')
        action.value.backgroundMode = 'standard-gradient';
    }
  },
);
watch(
  () => action.value.iconMode,
  (mode) => {
    if (mode !== 'asset') void iconSlot.detach();
  },
);
watch(
  () => action.value.backgroundMode,
  (mode) => {
    if (mode !== 'accent-gradient')
      action.value.accentColor = DEFAULT_PROJECT_ACTION.accentColor;
    if (mode !== 'asset') {
      action.value.backgroundSize = DEFAULT_PROJECT_ACTION.backgroundSize;
      action.value.backgroundRepeat = DEFAULT_PROJECT_ACTION.backgroundRepeat;
      void backgroundSlot.detach();
    }
  },
);
watch(
  () => action.value.backgroundSize,
  (size) => {
    action.value.backgroundRepeat = normalizeProjectActionBackgroundRepeat(
      size,
      action.value.backgroundRepeat,
    );
  },
);
watch(
  () => action.value.externalUrl,
  () => {
    const requestId = ++faviconRequestId;
    faviconResolved.value = false;
    loadingFavicon.value = false;
    faviconMedia.value = undefined;
    externalLinkPreview.value = undefined;
    clearTimeout(faviconTimer);
    if (!action.value.externalUrl) {
      faviconResolved.value = true;
      return;
    }
    faviconTimer = setTimeout(() => loadFavicon(requestId), 450);
  },
  { immediate: true },
);
watch([() => action.value.iconMode, () => action.value.backgroundMode], () => {
  if (
    action.value.target === 'external-link' &&
    action.value.externalUrl &&
    !faviconMedia.value &&
    faviconResolved.value
  )
    loadFavicon(faviconRequestId);
});
onUnmounted(() => clearTimeout(faviconTimer));

async function loadFavicon(requestId = faviconRequestId) {
  const url = action.value.externalUrl;
  if (!url || requestId !== faviconRequestId) return;
  loadingFavicon.value = true;
  try {
    const preview = await $fetch<ExternalLink>(
      '/api/admin/external-link-previews',
      {
        method: 'POST',
        body: { url },
      },
    );
    if (requestId !== faviconRequestId) return;
    faviconMedia.value = preview.faviconMedia;
    externalLinkPreview.value = preview;
  } catch {
    if (requestId !== faviconRequestId) return;
    faviconMedia.value = undefined;
    externalLinkPreview.value = undefined;
  } finally {
    if (requestId !== faviconRequestId) return;
    loadingFavicon.value = false;
    faviconResolved.value = true;
  }
}

function applyFile(asset: AssetVariantInfo) {
  const result = mapAssetVariantToReplaceResult(asset);
  action.value.fileAssetUuid = result.assetUuid;
  fileUrl.value = result.assetUrl;
  fileMedia.value = result.media;
  fileExtension.value = result.extension;
  fileSize.value = result.size;
  action.value.fileTitle ??=
    assetSourceName(asset.meta)?.replace(/\.[^.]+$/, '') ??
    phrase.value.project_file;
}

async function openFileDetails(initialAsset: AssetVariantInfo) {
  let current = initialAsset;
  let fileTitle = action.value.fileTitle;
  let fileDescription = action.value.fileDescription;
  while (true) {
    const result = await openModal(assetDetailsModal, {
      asideTitle: phrase.value.project_action_file,
      asset: mapAssetVariantToReplaceResult(current),
      primaryLabel: phrase.value.save,
      showTitle: true,
      requireTitle: true,
      initialTitle: fileTitle,
      showCaption: true,
      initialCaption: fileDescription,
      captionAsTextarea: true,
      captionPlaceholder: phrase.value.project_action_file_description,
    });
    if (result.type === 'replace') {
      fileTitle = result.title ?? fileTitle;
      fileDescription = result.caption;
      const replacement = await launchAssetEditor(current, {
        accept: anyFileExtensionProfile,
        maxSize: ASSET_UPLOAD_LIMITS.file,
        sizeLimitPolicy: 'file',
        usageDelta: usageDelta(),
      });
      if (!replacement) continue;
      applyFile(replacement);
      current = replacement;
      continue;
    }
    if (result.type === 'confirm') {
      action.value.fileTitle = result.title!;
      action.value.fileDescription = result.caption;
    } else if (result.type === 'detach') clearFile();
    return;
  }
}

async function loadActionFileVariant() {
  if (!action.value.fileAssetUuid) return;
  const family = await $fetch<AssetVariantsResponse>(
    `/api/admin/assets/${action.value.fileAssetUuid}/variants`,
  );
  return family.variants.find(
    (variant) => variant.assetUuid === action.value.fileAssetUuid,
  );
}

async function openFileAsset() {
  if (action.value.fileAssetUuid) {
    const current = await loadActionFileVariant();
    if (current) await openFileDetails(current);
    return;
  }
  const picked = await launchAssetWizard({
    accept: anyFileExtensionProfile,
    maxSize: ASSET_UPLOAD_LIMITS.file,
    sizeLimitPolicy: 'file',
  });
  if (!picked) return;
  applyFile(picked);
  await openFileDetails(picked);
}

function clearFile() {
  action.value.fileAssetUuid = undefined;
  fileUrl.value = undefined;
  fileMedia.value = undefined;
  fileExtension.value = undefined;
  fileSize.value = undefined;
  action.value.fileTitle = undefined;
  action.value.fileDescription = undefined;
  if (action.value.backgroundMode === 'file-gradient')
    action.value.backgroundMode = 'standard-gradient';
}
</script>

<template>
  <div>
    <SectionHeader
      icon="action-click"
      :title="phrase.project_action"
      :description="phrase.project_action_hint"
      class="mb-md"
    />
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <div class="flex flex-wrap items-center gap-md">
        <Field class="min-w-50 flex-1">
          <FieldLabel>{{ phrase.project_action_text }}</FieldLabel>
          <FieldInput v-model="action.text" maxlength="30" autocomplete="off" />
        </Field>

        <template v-if="hasActionText">
          <Field class="shrink-0">
            <FieldLabel required>{{ phrase.project_action_type }}</FieldLabel>
            <FieldOptions
              v-model="action.target"
              direction="row"
              :options="{
                file: { icon: 'file', title: phrase.project_action_file_type },
                'external-link': {
                  icon: 'external-link',
                  title: phrase.project_action_link,
                },
              }"
            />
          </Field>

          <Field class="shrink-0">
            <FieldToggle v-model="action.isPrivate">
              <span class="inline-flex items-center gap-xs">
                <Icon name="lock-close" />
                <span>{{ phrase.project_action_private }}</span>
              </span>
            </FieldToggle>
            <FieldHint>{{ phrase.project_action_private_hint }}</FieldHint>
          </Field>
        </template>
      </div>

      <template v-if="hasActionText">
        <div
          v-if="action.target === 'external-link'"
          class="flex flex-wrap gap-md"
        >
          <Field class="min-w-50 flex-1">
            <FieldLabel required>{{
              phrase.project_action_link_url
            }}</FieldLabel>
            <FieldInput
              v-model="action.externalUrl"
              type="url"
              placeholder="https://example.com/"
              autocomplete="off"
            />
          </Field>
          <Field class="min-w-70 flex-1">
            <FieldLabel>{{ phrase.project_action_link_preview }}</FieldLabel>
            <ExternalLinkPreviewCard
              :link="externalLinkPreview"
              :url="action.externalUrl"
              :interactive="true"
              :loading="loadingFavicon"
              :loading-text="phrase.project_action_link_loading"
            />
          </Field>
        </div>
        <div v-else class="flex flex-wrap items-start gap-md">
          <Field class="shrink-0 text-center">
            <FieldLabel required>{{
              phrase.project_action_target_file
            }}</FieldLabel>
            <AssetTile
              :media="fileMedia"
              :extension="fileExtension"
              :overlay="{
                size: fileSize,
                showSize: fileSize != null,
                isPrivate: action.isPrivate,
                editable: true,
              }"
              :aria-label="
                action.fileAssetUuid
                  ? phrase.project_action_file_edit
                  : phrase.project_action_file_select
              "
              class="mx-auto size-24 cursor-pointer"
              @click="openFileAsset"
            />
          </Field>
          <div class="flex min-w-50 flex-1 flex-col gap-sm">
            <Field>
              <FieldLabel required>{{
                phrase.project_action_file_title
              }}</FieldLabel>
              <FieldInput v-model="action.fileTitle" autocomplete="off" />
            </Field>
            <Field>
              <FieldLabel>{{
                phrase.project_action_file_description
              }}</FieldLabel>
              <FieldTextarea
                v-model="action.fileDescription"
                :placeholder="
                  phrase.project_action_file_description_placeholder
                "
              />
            </Field>
          </div>
        </div>

        <div class="flex min-w-0 flex-wrap gap-md">
          <Field class="min-w-70 flex-1">
            <FieldLabel>{{ phrase.project_action_background }}</FieldLabel>
            <div class="flex flex-wrap items-start gap-xs">
              <FieldSelect
                v-model="action.backgroundMode"
                :options="{
                  'standard-gradient':
                    phrase.project_action_background_standard,
                  'accent-gradient': phrase.project_action_background_accent,
                  asset: phrase.image,
                  ...((action.iconMode === 'asset' &&
                    iconMedia?.accentHue !== undefined) ||
                  action.backgroundMode === 'icon-gradient'
                    ? {
                        'icon-gradient':
                          phrase.project_action_background_icon_color,
                      }
                    : {}),
                  ...((action.target === 'file' &&
                    fileMedia?.accentHue !== undefined) ||
                  action.backgroundMode === 'file-gradient'
                    ? {
                        'file-gradient':
                          phrase.project_action_background_file_color,
                      }
                    : {}),
                  ...((hasSiteIcon && faviconMedia?.accentHue !== undefined) ||
                  action.backgroundMode === 'link-gradient'
                    ? {
                        'link-gradient':
                          phrase.project_action_background_link_color,
                      }
                    : {}),
                }"
              />
              <div
                v-if="action.backgroundMode === 'accent-gradient'"
                class="flex items-center gap-xs"
              >
                <input
                  v-model="action.accentColor"
                  type="color"
                  :aria-label="phrase.project_action_accent_color"
                  class="size-10 cursor-pointer rounded-sm border
                    border-border-1 bg-bg-2 p-1"
                />
                <code class="text-sm text-text-2">{{
                  action.accentColor
                }}</code>
              </div>
              <AssetTile
                v-if="action.backgroundMode === 'asset'"
                :media="backgroundMedia"
                :overlay="{
                  size: backgroundAssetSize,
                  showSize: backgroundAssetSize != null,
                  isPrivate: action.isPrivate,
                  editable: true,
                }"
                :aria-label="
                  action.backgroundAssetUuid
                    ? phrase.project_action_background_edit
                    : phrase.project_action_background_select
                "
                class="h-12 w-32 shrink-0 cursor-pointer"
                @click="backgroundSlot.open"
              />
            </div>
            <div
              v-if="action.backgroundMode === 'asset'"
              class="flex flex-wrap items-end gap-sm"
            >
              <Field class="min-w-28 text-xs">
                <FieldLabel>{{
                  phrase.project_action_background_size
                }}</FieldLabel>
                <FieldSelect
                  v-model="action.backgroundSize"
                  size="xs"
                  :options="{
                    natural: phrase.project_action_background_size_natural,
                    contain: phrase.project_action_background_size_contain,
                    cover: phrase.project_action_background_size_cover,
                    stretch: phrase.project_action_background_size_stretch,
                  }"
                />
              </Field>
              <Field class="min-w-28 text-xs">
                <FieldLabel>{{
                  phrase.project_action_background_repeat
                }}</FieldLabel>
                <FieldSelect
                  v-model="action.backgroundRepeat"
                  size="xs"
                  :disabled="
                    action.backgroundSize === 'cover' ||
                    action.backgroundSize === 'stretch'
                  "
                  :options="{
                    'no-repeat': phrase.project_action_background_repeat_none,
                    'repeat-x': phrase.project_action_background_repeat_x,
                    'repeat-y': phrase.project_action_background_repeat_y,
                    repeat: phrase.project_action_background_repeat_both,
                  }"
                />
              </Field>
            </div>
          </Field>

          <Field class="min-w-70 flex-1">
            <FieldLabel>{{ phrase.project_action_icon }}</FieldLabel>
            <div class="flex flex-wrap items-start gap-xs">
              <FieldSelect
                v-model="action.iconMode"
                :options="{
                  fallback: phrase.project_action_icon_default,
                  ...(hasSiteIcon || action.iconMode === 'favicon'
                    ? { favicon: phrase.project_action_icon_site }
                    : {}),
                  asset: phrase.image,
                }"
              />
              <AssetTile
                v-if="action.iconMode === 'asset'"
                :media="action.iconAssetUuid ? iconMedia : undefined"
                :overlay="{
                  size: iconSize,
                  showSize: iconSize != null,
                  isPrivate: action.isPrivate,
                  editable: true,
                }"
                :aria-label="
                  action.iconAssetUuid
                    ? phrase.project_action_icon_edit
                    : phrase.project_action_icon_select
                "
                class="size-24 cursor-pointer"
                @click="iconSlot.open"
              />
            </div>
          </Field>
        </div>

        <div class="rounded-normal border border-border-1 bg-bg-1 p-md">
          <p
            class="mb-sm text-center text-xs font-semibold tracking-wide
              text-text-3 uppercase"
          >
            {{ phrase.project_action_preview }}
          </p>
          <div class="flex justify-center">
            <ProjectActionButton
              :text="action.text"
              :accent-color="action.accentColor"
              :target="action.target"
              :href="
                action.target === 'external-link' ? previewHref : undefined
              "
              :interactive="action.target === 'file' && !!action.fileAssetUuid"
              :activate="openFileAsset"
              :icon-media="action.iconAssetUuid ? iconMedia : undefined"
              :file-media="fileMedia"
              :favicon-media="faviconMedia"
              :use-favicon="previewUsesFavicon"
              :background-media="
                action.backgroundMode === 'asset' ? backgroundMedia : undefined
              "
              :background-mode="previewBackgroundMode"
              :background-size="action.backgroundSize"
              :background-repeat="action.backgroundRepeat"
              class="w-full sm:w-auto"
            />
          </div>
        </div>
      </template>
    </Box>
  </div>
</template>
