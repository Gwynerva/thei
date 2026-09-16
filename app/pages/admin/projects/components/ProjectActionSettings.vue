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
  PROJECT_ACTION_TEXT_MAX_LENGTH,
  normalizeProjectActionBackgroundRepeat,
  projectActionIconMode,
  projectActionIssues,
  type ProjectActionEditData,
  type ProjectActionIssue,
} from '#layers/thei/shared/project-action';
import {
  normalizeExternalLinkUrl,
  type ExternalLink,
} from '#layers/thei/shared/external-link';
import { projectAssetUsageDelta } from '#layers/thei/shared/admin/project';
import { assetDetailsModal } from '#layers/thei/app/modals/asset-details/modal';
import { useSingleMediaAsset } from '#layers/thei/app/composables/single-media-asset';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import type { FieldOptions } from '#layers/thei/app/components/field/FieldOptions.vue';
import {
  projectDataInjectionKey,
  savedProjectDataInjectionKey,
  projectActionMediaKey,
} from '../composables';

const props = defineProps<{
  sectionTitle?: string;
  sectionDescription?: string;
}>();

const projectData = inject(projectDataInjectionKey)!;
const savedProjectData = inject(savedProjectDataInjectionKey)!;
const {
  iconMedia,
  iconSize,
  backgroundMedia,
  backgroundSize: backgroundAssetSize,
  fileMedia,
  fileExtension,
  fileSize,
  faviconMedia,
} = inject(projectActionMediaKey)!;
const humanSize = useHumanSize();

if (!projectData.value.action)
  projectData.value.action = { ...DEFAULT_PROJECT_ACTION };
const action = computed<ProjectActionEditData>(() => projectData.value.action!);

const isLink = computed(() => action.value.target === 'external-link');
const textLength = computed(() => Array.from(action.value.text).length);
const issues = computed(() => projectActionIssues(action.value));
const hasIssue = (issue: ProjectActionIssue) => issues.value.includes(issue);
const issueLabels = computed<Record<ProjectActionIssue, string>>(() => ({
  text: phrase.value.project_action_issue_text,
  'text-length': phrase.value.project_action_issue_text_length(
    PROJECT_ACTION_TEXT_MAX_LENGTH,
  ),
  url: phrase.value.project_action_issue_url,
  file: phrase.value.project_action_issue_file,
  icon: phrase.value.project_action_issue_icon,
  background: phrase.value.project_action_issue_background,
  color: phrase.value.project_action_issue_color,
}));

const targetOptions = computed<FieldOptions>(() => ({
  'external-link': {
    icon: 'external-link',
    title: phrase.value.project_action_link,
  },
  file: { icon: 'file', title: phrase.value.project_action_file_type },
}));
const iconOptions = computed<FieldOptions>(() => ({
  fallback: { title: phrase.value.project_action_icon_default },
  ...(isLink.value
    ? { favicon: { title: phrase.value.project_action_icon_site } }
    : {}),
  asset: { title: phrase.value.project_action_icon_custom },
}));
const backgroundOptions = computed<FieldOptions>(() => ({
  'standard-gradient': {
    title: phrase.value.project_action_background_standard,
    description: phrase.value.project_action_background_standard_hint,
  },
  'auto-gradient': {
    title: phrase.value.project_action_background_auto,
    description: phrase.value.project_action_background_auto_hint,
  },
  'accent-gradient': {
    title: phrase.value.project_action_background_accent,
    description: phrase.value.project_action_background_accent_hint,
  },
  asset: {
    title: phrase.value.image,
    description: phrase.value.project_action_background_image_hint,
  },
}));

// Switching a mode keeps the settings of the previous one, so nothing is lost
// by clicking around. Saving normalizes them away.
const iconMode = computed({
  get: () => projectActionIconMode(action.value.target, action.value.iconMode),
  set: (mode) => {
    action.value.iconMode = mode;
  },
});
watch(
  () => action.value.backgroundSize,
  (size) => {
    action.value.backgroundRepeat = normalizeProjectActionBackgroundRepeat(
      size,
      action.value.backgroundRepeat,
    );
  },
);

const usageDelta = () =>
  projectAssetUsageDelta(projectData.value, savedProjectData.value);
const iconSlot = useSingleMediaAsset({
  uploadProfile: 'project-action-icon',
  accept: [imageExtensionProfile],
  asideTitle: () => phrase.value.project_action_icon,
  getAssetUuid: () => action.value.iconAssetUuid,
  setAssetUuid: (assetUuid) => {
    action.value.iconAssetUuid = assetUuid;
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

// Link preview and favicon
const externalLinkPreview = ref<ExternalLink>();
const loadingLink = ref(false);
let previewedUrl: string | undefined;
let linkTimer: ReturnType<typeof setTimeout> | undefined;
let linkRequestId = 0;

function validUrl(value: string | undefined) {
  try {
    return normalizeExternalLinkUrl(value);
  } catch {
    return undefined;
  }
}

watch(
  [() => action.value.externalUrl, () => action.value.target],
  ([url, target], previous) => {
    if (import.meta.server) return;
    if (previous && url !== previous[0]) {
      faviconMedia.value = undefined;
      externalLinkPreview.value = undefined;
      previewedUrl = undefined;
    }
    clearTimeout(linkTimer);
    const requestId = ++linkRequestId;
    loadingLink.value = false;
    if (target !== 'external-link' || !validUrl(url) || previewedUrl === url)
      return;
    loadingLink.value = true;
    linkTimer = setTimeout(
      () => loadLinkPreview(url!, requestId),
      previous ? 450 : 0,
    );
  },
  { immediate: true },
);
onUnmounted(() => clearTimeout(linkTimer));

async function loadLinkPreview(url: string, requestId: number) {
  try {
    const preview = await $fetch<ExternalLink>(
      '/api/admin/external-link-previews',
      { method: 'POST', body: { url } },
    );
    if (requestId !== linkRequestId) return;
    externalLinkPreview.value = preview;
    faviconMedia.value = preview.faviconMedia;
    previewedUrl = url;
  } catch {
    if (requestId !== linkRequestId) return;
    externalLinkPreview.value = undefined;
  } finally {
    if (requestId === linkRequestId) loadingLink.value = false;
  }
}

// Target file
function applyFile(asset: AssetVariantInfo) {
  const result = mapAssetVariantToReplaceResult(asset);
  action.value.fileAssetUuid = result.assetUuid;
  fileMedia.value = result.media;
  fileExtension.value = result.extension;
  fileSize.value = result.size;
}

function clearFile() {
  action.value.fileAssetUuid = undefined;
  fileMedia.value = undefined;
  fileExtension.value = undefined;
  fileSize.value = undefined;
}

async function openFileDetails(initialAsset: AssetVariantInfo) {
  let current = initialAsset;
  while (true) {
    const result = await openModal(assetDetailsModal, {
      asideTitle: phrase.value.project_action_file,
      asset: mapAssetVariantToReplaceResult(current),
    });
    if (result.type === 'replace') {
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
    if (result.type === 'detach') clearFile();
    return;
  }
}

function openFileAsset() {
  return runModalFlow(async () => {
    if (action.value.fileAssetUuid) {
      const family = await $fetch<AssetVariantsResponse>(
        `/api/admin/assets/${action.value.fileAssetUuid}/variants`,
      );
      const current = family.variants.find(
        (variant) => variant.assetUuid === action.value.fileAssetUuid,
      );
      if (current) await openFileDetails(current);
      return;
    }
    const picked = await launchAssetWizard({
      accept: anyFileExtensionProfile,
      maxSize: ASSET_UPLOAD_LIMITS.file,
      sizeLimitPolicy: 'file',
      usageDelta: usageDelta(),
    });
    if (!picked) return;
    applyFile(picked);
    await openFileDetails(picked);
  });
}
</script>

<template>
  <div>
    <SectionHeader
      icon="action-click"
      :title="props.sectionTitle ?? phrase.project_action"
      :description="props.sectionDescription ?? phrase.project_action_hint"
      class="mb-md"
    />
    <Box class="overflow-hidden">
      <div
        class="flex flex-wrap items-center justify-between gap-x-md gap-y-sm
          p-sm sm:px-md"
      >
        <FieldToggle
          v-model="action.enabled"
          :label="phrase.project_action_enabled"
        />
        <FieldToggle v-if="action.enabled" v-model="action.isPrivate">
          <span
            class="inline-flex cursor-pointer items-center gap-xs text-sm
              font-semibold text-text-2 select-none"
            :data-title-popup="phrase.project_action_private_hint"
            @click="action.isPrivate = !action.isPrivate"
          >
            <Icon :name="action.isPrivate ? 'lock-close' : 'lock-open'" />
            <span>{{ phrase.project_action_private }}</span>
          </span>
        </FieldToggle>
        <p v-else class="w-full text-sm text-text-3">
          {{ phrase.project_action_disabled_hint }}
        </p>
      </div>

      <template v-if="action.enabled">
        <div
          class="action-stage flex flex-col items-center gap-sm border-y
            border-border-1 bg-bg-1 px-sm py-md sm:py-lg"
        >
          <span
            class="text-xs font-semibold tracking-wide text-text-3 uppercase"
          >
            {{ phrase.project_action_preview }}
          </span>
          <ProjectActionButton
            preview
            :text="action.text"
            :accent-color="action.accentColor"
            :target="action.target"
            :icon-media="iconMode === 'asset' ? iconMedia : undefined"
            :file-media="isLink ? undefined : fileMedia"
            :favicon-media="isLink ? faviconMedia : undefined"
            :use-favicon="iconMode === 'favicon'"
            :background-media="
              action.backgroundMode === 'asset' ? backgroundMedia : undefined
            "
            :background-mode="action.backgroundMode"
            :background-size="action.backgroundSize"
            :background-repeat="action.backgroundRepeat"
            class="w-full sm:w-auto"
          />
          <span
            v-if="action.isPrivate"
            class="inline-flex items-center gap-1 text-xs text-text-3"
          >
            <Icon name="lock-close" />
            {{ phrase.project_action_private_hint }}
          </span>
        </div>

        <div class="grid gap-lg p-sm sm:grid-cols-2 sm:p-md">
          <section class="flex min-w-0 flex-col gap-md">
            <h3
              class="text-xs font-semibold tracking-wide text-text-3 uppercase"
            >
              {{ phrase.project_action_group_action }}
            </h3>

            <Field>
              <div class="flex items-baseline justify-between gap-xs">
                <FieldLabel required>{{
                  phrase.project_action_text
                }}</FieldLabel>
                <span
                  class="text-xs text-text-3 tabular-nums"
                  :class="{ 'text-text-error': hasIssue('text-length') }"
                  >{{ textLength }}/{{ PROJECT_ACTION_TEXT_MAX_LENGTH }}</span
                >
              </div>
              <FieldInput
                v-model="action.text"
                :maxlength="PROJECT_ACTION_TEXT_MAX_LENGTH"
                :placeholder="phrase.project_action_placeholder"
                autocomplete="off"
              />
            </Field>

            <Field>
              <FieldLabel>{{ phrase.project_action_type }}</FieldLabel>
              <FieldOptions v-model="action.target" :options="targetOptions" />
            </Field>

            <Field v-if="isLink">
              <FieldLabel required>{{
                phrase.project_action_link_url
              }}</FieldLabel>
              <FieldInput
                v-model="action.externalUrl"
                type="url"
                placeholder="https://example.com/"
                autocomplete="off"
              />
              <ExternalLinkPreviewCard
                v-if="validUrl(action.externalUrl)"
                :link="externalLinkPreview"
                :url="action.externalUrl"
                :interactive="true"
                :loading="loadingLink"
                :loading-text="phrase.project_action_link_loading"
              />
            </Field>

            <Field v-else>
              <FieldLabel required>{{
                phrase.project_action_target_file
              }}</FieldLabel>
              <div class="flex items-center gap-sm">
                <AssetTile
                  :media="action.fileAssetUuid ? fileMedia : undefined"
                  :extension="action.fileAssetUuid ? fileExtension : undefined"
                  :overlay="
                    action.fileAssetUuid
                      ? { isPrivate: action.isPrivate, editable: true }
                      : undefined
                  "
                  :aria-label="
                    action.fileAssetUuid
                      ? phrase.project_action_file_edit
                      : phrase.project_action_file_select
                  "
                  class="size-16 shrink-0 cursor-pointer"
                  @click="openFileAsset"
                />
                <button
                  type="button"
                  class="group min-w-0 cursor-pointer text-left"
                  @click="openFileAsset"
                >
                  <span
                    class="block truncate font-semibold transition
                      group-hocus:text-accent"
                  >
                    <template v-if="action.fileAssetUuid">
                      {{ fileExtension?.toUpperCase() ?? '?' }}
                      <span v-if="fileSize != null" class="text-text-2">
                        · {{ humanSize(fileSize) }}
                      </span>
                    </template>
                    <template v-else>
                      {{ phrase.project_action_file_select }}
                    </template>
                  </span>
                  <span class="block text-xs text-text-3">
                    {{
                      action.fileAssetUuid
                        ? phrase.project_action_file_edit_hint
                        : phrase.project_action_file_select_hint
                    }}
                  </span>
                </button>
              </div>
            </Field>
          </section>

          <section class="flex min-w-0 flex-col gap-md">
            <h3
              class="text-xs font-semibold tracking-wide text-text-3 uppercase"
            >
              {{ phrase.project_action_group_look }}
            </h3>

            <Field>
              <FieldLabel>{{ phrase.project_action_icon }}</FieldLabel>
              <FieldOptions v-model="iconMode" :options="iconOptions" />
              <div v-if="iconMode === 'asset'" class="flex items-center gap-sm">
                <AssetTile
                  :media="action.iconAssetUuid ? iconMedia : undefined"
                  :overlay="
                    action.iconAssetUuid
                      ? { isPrivate: action.isPrivate, editable: true }
                      : undefined
                  "
                  :aria-label="
                    action.iconAssetUuid
                      ? phrase.project_action_icon_edit
                      : phrase.project_action_icon_select
                  "
                  class="size-14 shrink-0 cursor-pointer"
                  @click="iconSlot.open"
                />
                <p class="text-xs text-text-3">
                  {{ phrase.project_action_icon_custom_hint }}
                </p>
              </div>
            </Field>

            <Field>
              <FieldLabel>{{ phrase.project_action_background }}</FieldLabel>
              <FieldOptions
                v-model="action.backgroundMode"
                :options="backgroundOptions"
              />
              <p
                v-if="action.backgroundMode === 'auto-gradient'"
                class="text-xs text-text-3"
              >
                {{ phrase.project_action_background_auto_hint }}
              </p>

              <div
                v-if="action.backgroundMode === 'accent-gradient'"
                class="flex items-center gap-xs"
              >
                <label
                  class="relative size-10 shrink-0 cursor-pointer
                    overflow-hidden rounded-full border-2 border-border-1
                    shadow-sm transition hover:border-border-3
                    has-focus-visible:border-border-3"
                  :style="{ backgroundColor: action.accentColor }"
                >
                  <input
                    v-model="action.accentColor"
                    type="color"
                    :aria-label="phrase.project_action_accent_color"
                    class="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </label>
                <FieldInput
                  v-model="action.accentColor"
                  maxlength="7"
                  spellcheck="false"
                  autocomplete="off"
                  :aria-label="phrase.project_action_accent_color"
                  class="font-mono text-sm uppercase"
                  wrapper-class="w-32"
                />
              </div>

              <template v-if="action.backgroundMode === 'asset'">
                <div class="flex flex-wrap items-center gap-sm">
                  <AssetTile
                    :media="
                      action.backgroundAssetUuid ? backgroundMedia : undefined
                    "
                    :overlay="
                      action.backgroundAssetUuid
                        ? {
                            size: backgroundAssetSize,
                            showSize: backgroundAssetSize != null,
                            isPrivate: action.isPrivate,
                            editable: true,
                          }
                        : undefined
                    "
                    :aria-label="
                      action.backgroundAssetUuid
                        ? phrase.project_action_background_edit
                        : phrase.project_action_background_select
                    "
                    class="h-14 w-36 shrink-0 cursor-pointer"
                    @click="backgroundSlot.open"
                  />
                  <AssetAspectHint profile="project-action-background" />
                </div>
                <div class="flex flex-wrap gap-sm">
                  <Field class="text-sm">
                    <FieldLabel>{{
                      phrase.project_action_background_size
                    }}</FieldLabel>
                    <FieldSelect
                      v-model="action.backgroundSize"
                      :options="{
                        natural: phrase.project_action_background_size_natural,
                        contain: phrase.project_action_background_size_contain,
                        cover: phrase.project_action_background_size_cover,
                        stretch: phrase.project_action_background_size_stretch,
                      }"
                    />
                  </Field>
                  <Field class="text-sm">
                    <FieldLabel>{{
                      phrase.project_action_background_repeat
                    }}</FieldLabel>
                    <FieldSelect
                      v-model="action.backgroundRepeat"
                      :disabled="
                        action.backgroundSize === 'cover' ||
                        action.backgroundSize === 'stretch'
                      "
                      :options="{
                        'no-repeat':
                          phrase.project_action_background_repeat_none,
                        'repeat-x': phrase.project_action_background_repeat_x,
                        'repeat-y': phrase.project_action_background_repeat_y,
                        repeat: phrase.project_action_background_repeat_both,
                      }"
                    />
                  </Field>
                </div>
              </template>
            </Field>
          </section>
        </div>

        <div
          v-if="issues.length"
          role="status"
          class="mx-sm mb-sm flex items-start gap-xs rounded-normal border
            border-border-warning bg-bg-warning p-xs text-sm text-text-warning
            sm:mx-md sm:mb-md"
        >
          <Icon name="warning" class="mt-0.5 shrink-0" />
          <p>
            <span class="font-semibold">{{
              phrase.project_action_issues
            }}</span>
            {{ issues.map((issue) => issueLabels[issue]).join(', ') }}
          </p>
        </div>
      </template>
    </Box>
  </div>
</template>

<style scoped>
.action-stage {
  background-image: radial-gradient(
    color-mix(in oklab, var(--color-border-1) 70%, transparent) 1px,
    transparent 1px
  );
  background-size: 1rem 1rem;
  background-position: center;
}
</style>
