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
  asideTitle: () => 'Иконка кнопки действия',
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
  asideTitle: () => 'Фон кнопки действия',
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
      ensureFaviconIconAvailable();
      ensureContextualBackgroundAvailable();
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
watch(
  [() => iconMedia.value?.accentHue, () => fileMedia.value?.accentHue],
  ensureContextualBackgroundAvailable,
  { immediate: true },
);
onUnmounted(() => clearTimeout(faviconTimer));

async function loadFavicon(requestId = faviconRequestId) {
  const url = action.value.externalUrl;
  if (!url || requestId !== faviconRequestId) return;
  loadingFavicon.value = true;
  try {
    const preview = await $fetch<ExternalLink>(
      '/api/admin/external-links/preview',
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
    ensureFaviconIconAvailable();
    ensureContextualBackgroundAvailable();
  }
}

function ensureFaviconIconAvailable() {
  if (
    action.value.iconMode === 'favicon' &&
    (action.value.target !== 'external-link' ||
      (faviconResolved.value && !hasSiteIcon.value))
  )
    action.value.iconMode = 'fallback';
}

function ensureContextualBackgroundAvailable() {
  const mode = action.value.backgroundMode;
  const unavailable =
    (mode === 'icon-gradient' &&
      (action.value.iconMode !== 'asset' ||
        iconMedia.value?.accentHue === undefined)) ||
    (mode === 'file-gradient' &&
      (action.value.target !== 'file' ||
        fileMedia.value?.accentHue === undefined)) ||
    (mode === 'link-gradient' &&
      (action.value.target !== 'external-link' ||
        (faviconResolved.value &&
          (!hasSiteIcon.value ||
            faviconMedia.value?.accentHue === undefined))));
  if (unavailable) action.value.backgroundMode = 'standard-gradient';
}

function applyFile(asset: AssetVariantInfo) {
  const result = mapAssetVariantToReplaceResult(asset);
  action.value.fileAssetUuid = result.assetUuid;
  fileUrl.value = result.assetUrl;
  fileMedia.value = result.media;
  fileExtension.value = result.extension;
  fileSize.value = result.size;
  action.value.fileTitle ??=
    assetSourceName(asset.meta)?.replace(/\.[^.]+$/, '') ?? 'Файл проекта';
}

async function openFileDetails(
  initialAsset: AssetVariantInfo,
  modalFlowId = createModalFlow(),
) {
  let current = initialAsset;
  const flowVersion = modalDismissVersion.value;
  let fileTitle = action.value.fileTitle;
  let fileDescription = action.value.fileDescription;
  while (true) {
    const result = await openModal(
      assetDetailsModal,
      {
        asideTitle: 'Файл кнопки действия',
        asset: mapAssetVariantToReplaceResult(current),
        primaryLabel: 'Сохранить',
        showTitle: true,
        requireTitle: true,
        initialTitle: fileTitle,
        showCaption: true,
        initialCaption: fileDescription,
        captionAsTextarea: true,
        captionPlaceholder: 'Описание файла',
      },
      { label: 'Файл кнопки действия', flowId: modalFlowId },
    );
    if (result.type === 'replace') {
      fileTitle = result.title ?? fileTitle;
      fileDescription = result.caption;
      const replacement = await launchAssetEditor(current, {
        accept: anyFileExtensionProfile,
        maxSize: ASSET_UPLOAD_LIMITS.file,
        sizeLimitPolicy: 'file',
        usageDelta: usageDelta(),
        backLabel: 'Файл кнопки действия',
        modalFlowId,
      });
      if (modalDismissVersion.value !== flowVersion) return;
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
    '/api/admin/assets/variants',
    { method: 'POST', body: { assetUuid: action.value.fileAssetUuid } },
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
  const modalFlowId = createModalFlow();
  const picked = await launchAssetWizard({
    accept: anyFileExtensionProfile,
    maxSize: ASSET_UPLOAD_LIMITS.file,
    sizeLimitPolicy: 'file',
    backLabel: 'Файл кнопки действия',
    modalFlowId,
  });
  if (!picked) return;
  applyFile(picked);
  await openFileDetails(picked, modalFlowId);
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
      title="Кнопка действия проекта"
      description="Главное действие, которое можно выполнить из проекта."
      class="mb-md"
    />
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <div class="flex flex-wrap items-center gap-md">
        <Field class="min-w-50 flex-1">
          <FieldLabel>Текст кнопки</FieldLabel>
          <FieldInput v-model="action.text" maxlength="30" autocomplete="off" />
        </Field>

        <template v-if="hasActionText">
          <Field class="shrink-0">
            <FieldLabel required>Действие</FieldLabel>
            <FieldOptions
              v-model="action.target"
              direction="row"
              :options="{
                file: { icon: 'file', title: 'Файл' },
                'external-link': {
                  icon: 'external-link',
                  title: 'Ссылка',
                },
              }"
            />
          </Field>

          <Field class="shrink-0">
            <FieldToggle v-model="action.isPrivate">
              <span class="inline-flex items-center gap-xs">
                <Icon name="lock-close" />
                <span>Приватная кнопка</span>
              </span>
            </FieldToggle>
            <FieldHint>Кнопка будет видна только вам</FieldHint>
          </Field>
        </template>
      </div>

      <template v-if="hasActionText">
        <div
          v-if="action.target === 'external-link'"
          class="flex flex-wrap gap-md"
        >
          <Field class="min-w-50 flex-1">
            <FieldLabel required>Адрес ссылки</FieldLabel>
            <FieldInput
              v-model="action.externalUrl"
              type="url"
              placeholder="https://example.com/"
              autocomplete="off"
            />
          </Field>
          <Field class="min-w-70 flex-1">
            <FieldLabel>Предпросмотр ссылки</FieldLabel>
            <ExternalLinkPreviewCard
              :link="externalLinkPreview"
              :url="action.externalUrl"
              :loading="loadingFavicon"
              loading-text="Получаем данные сайта…"
            />
          </Field>
        </div>
        <div v-else class="flex flex-wrap items-start gap-md">
          <Field class="shrink-0 text-center">
            <FieldLabel required>Целевой файл</FieldLabel>
            <AssetTile
              :media="fileMedia"
              :extension="fileExtension"
              :size="fileSize"
              :is-private="action.isPrivate"
              :aria-label="
                action.fileAssetUuid
                  ? 'Изменить файл кнопки действия'
                  : 'Выбрать файл кнопки действия'
              "
              class="mx-auto size-24 cursor-pointer"
              @click="openFileAsset"
            />
          </Field>
          <div class="flex min-w-50 flex-1 flex-col gap-sm">
            <Field>
              <FieldLabel required>Название файла</FieldLabel>
              <FieldInput v-model="action.fileTitle" autocomplete="off" />
            </Field>
            <Field>
              <FieldLabel>Описание файла</FieldLabel>
              <FieldTextarea
                v-model="action.fileDescription"
                placeholder="Необязательное описание"
              />
            </Field>
          </div>
        </div>

        <div class="flex min-w-0 flex-wrap gap-md">
          <Field class="min-w-70 flex-1">
            <FieldLabel>Фон кнопки</FieldLabel>
            <div class="flex flex-wrap items-start gap-xs">
              <FieldSelect
                v-model="action.backgroundMode"
                :options="{
                  'standard-gradient': 'Стандартный',
                  'accent-gradient': 'Свой цвет',
                  asset: 'Изображение',
                  ...(action.iconMode === 'asset' &&
                  iconMedia?.accentHue !== undefined
                    ? { 'icon-gradient': 'Цвет иконки' }
                    : {}),
                  ...(action.target === 'file' &&
                  fileMedia?.accentHue !== undefined
                    ? { 'file-gradient': 'Цвет файла' }
                    : {}),
                  ...(hasSiteIcon && faviconMedia?.accentHue !== undefined
                    ? {
                        'link-gradient': 'Цвет ссылки',
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
                  aria-label="Акцентный цвет кнопки"
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
                :size="backgroundAssetSize"
                :is-private="action.isPrivate"
                :aria-label="
                  action.backgroundAssetUuid
                    ? 'Изменить фон кнопки действия'
                    : 'Выбрать фон кнопки действия'
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
                <FieldLabel>Размер</FieldLabel>
                <FieldSelect
                  v-model="action.backgroundSize"
                  size="xs"
                  :options="{
                    natural: 'По размеру',
                    contain: 'Вписать',
                    cover: 'Заполнить',
                    stretch: 'Растянуть',
                  }"
                />
              </Field>
              <Field class="min-w-28 text-xs">
                <FieldLabel>Повтор</FieldLabel>
                <FieldSelect
                  v-model="action.backgroundRepeat"
                  size="xs"
                  :disabled="
                    action.backgroundSize === 'cover' ||
                    action.backgroundSize === 'stretch'
                  "
                  :options="{
                    'no-repeat': 'Не повторять',
                    'repeat-x': 'По горизонтали',
                    'repeat-y': 'По вертикали',
                    repeat: 'По обеим',
                  }"
                />
              </Field>
            </div>
          </Field>

          <Field class="min-w-70 flex-1">
            <FieldLabel>Иконка кнопки</FieldLabel>
            <div class="flex flex-wrap items-start gap-xs">
              <FieldSelect
                v-model="action.iconMode"
                :options="{
                  fallback: 'Стандартная',
                  ...(hasSiteIcon ? { favicon: 'Иконка сайта' } : {}),
                  asset: 'Изображение',
                }"
              />
              <AssetTile
                v-if="action.iconMode === 'asset'"
                :media="action.iconAssetUuid ? iconMedia : undefined"
                :size="iconSize"
                :is-private="action.isPrivate"
                :aria-label="
                  action.iconAssetUuid
                    ? 'Изменить иконку кнопки действия'
                    : 'Выбрать иконку кнопки действия'
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
            Предпросмотр
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
              :use-favicon="action.iconMode === 'favicon'"
              :background-media="
                action.backgroundMode === 'asset' ? backgroundMedia : undefined
              "
              :background-mode="action.backgroundMode"
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
