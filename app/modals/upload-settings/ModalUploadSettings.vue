<script lang="ts" setup>
import type {
  AssetUploadResponse,
  AssetVariantInfo,
  AssetVariantsResponse,
  AssetWizardResult,
} from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import {
  buildAssetSettingsKey,
  createImageTransformSettings,
  createOriginalAssetSettings,
  createVideoTransformSettings,
  type AssetTransformSettings,
  type AssetUploadSettings,
} from '#layers/thei/shared/asset-upload-settings';
import {
  imageExtensionProfile,
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import AssetModal from '../asset-modal/AssetModal.vue';
import AssetModalButton from '../asset-modal/AssetModalButton.vue';
import AssetModalPreviewFile from '../asset-modal/AssetModalPreviewFile.vue';
import AssetModalPreviewMedia from '../asset-modal/AssetModalPreviewMedia.vue';
import type { VideoPlaybackState } from '../asset-modal/AssetModalPreviewMedia.vue';
import AssetModalFileInfo from '../asset-modal/AssetModalFileInfo.vue';
import type { MediaViewState } from '../asset-modal/media-controls';
import { useFileInfo } from '../asset-modal/use-file-info';
import type { PickedFile } from '../pick-file/picked-file';
import UploadSettingsDivider from './UploadSettingsDivider.vue';
import UploadSettingsEditProfile from './UploadSettingsEditProfile.vue';
import UploadSettingsSection from './UploadSettingsSection.vue';
import UploadSettingsVariantList from './UploadSettingsVariantList.vue';

type UploadSettingsResult = { type: 'upload-new' } | AssetWizardResult;
type BusyAction = 'variants' | 'upload-original' | 'apply';
type UseCandidate = 'original' | 'transformed' | 'selected' | null;
type ActiveProfile = 'original' | 'uploaded' | 'edit';
type UploadStatus =
  | { phase: 'uploading'; progress?: number }
  | { phase: 'processing'; progress?: number };

const emit = defineEmits<{
  modalResult: [result: UploadSettingsResult];
}>();

const props = defineProps<{
  modalData: {
    file: PickedFile;
    maxSize?: number;
    acceptedExtensions?: string[] | '*';
  };
}>();

const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');

const busyAction = ref<BusyAction>();
const uploadStatus = ref<UploadStatus | null>(null);
const activeXhr = shallowRef<XMLHttpRequest | null>(null);
const errorMessage = ref('');
const variants = ref<AssetVariantInfo[]>([]);
const selectedVariantUuid = ref('');
const activeAsset = shallowRef<AssetVariantInfo | null>(null);
const currentOriginalAsset = shallowRef<AssetVariantInfo | null>(null);
const currentTransformedAsset = shallowRef<AssetVariantInfo | null>(null);
const activeUseCandidate = ref<UseCandidate>(null);
const activeProfile = ref<ActiveProfile>('original');
const profileSelectedByUser = ref(false);
const temporaryAssetUuid = ref<string | null>(null);
const previewMode = ref<'original' | 'asset'>('original');
const previewViewStates = reactive(new Map<string, MediaViewState>());
const previewPlaybackStates = reactive(new Map<string, VideoPlaybackState>());
let progressPollTimer: ReturnType<typeof setInterval> | undefined;

const quality = ref(60);
const widthInput = ref('');
const heightInput = ref('');
const keepAspect = ref(true);
const muteAudio = ref(false);
const videoConversionMode = ref<'quality' | 'fast'>('quality');

const originalAssetType = computed(() => {
  if (
    isExtensionAllowed(props.modalData.file.extension, imageExtensionProfile)
  ) {
    return AssetType.Image;
  }
  if (
    isExtensionAllowed(props.modalData.file.extension, videoExtensionProfile)
  ) {
    return AssetType.Video;
  }
  return AssetType.Other;
});

const isOriginalMedia = computed(
  () =>
    originalAssetType.value === AssetType.Image ||
    originalAssetType.value === AssetType.Video,
);

const canTransform = computed(
  () =>
    originalAssetType.value === AssetType.Image ||
    originalAssetType.value === AssetType.Video,
);

const { dimensions: originalDimensions } = useFileInfo(
  props.modalData.file.objectUrl,
  props.modalData.file.extension,
);

if (originalAssetType.value === AssetType.Video) {
  quality.value = 40;
}

const originalVariant = computed(() =>
  variants.value.find((variant) => variant.isOriginal),
);
const reusableOriginalAsset = computed(
  () => currentOriginalAsset.value ?? originalVariant.value ?? null,
);

const selectedVariant = computed(() =>
  variants.value.find(
    (variant) => variant.assetUuid === selectedVariantUuid.value,
  ),
);
const sortedVariants = computed(() =>
  [...variants.value].sort((a, b) => a.size - b.size),
);
const hasUploadedVariants = computed(() => sortedVariants.value.length > 0);
const modifiedVariantNames = computed(() => {
  const names = new Map<string, string>();
  sortedVariants.value
    .filter((variant) => isTransformSettings(variant.settings))
    .forEach((variant, index) => {
      names.set(variant.assetUuid, `Измененный ${index + 1}`);
    });
  return names;
});

const activeAssetDimensions = computed(() =>
  currentTransformedAsset.value
    ? variantDimensions(currentTransformedAsset.value)
    : undefined,
);
const originalFileComparison = computed(() => ({
  extension: props.modalData.file.extension,
  size: props.modalData.file.size,
  dimensions: originalDimensions.value,
}));
const transformedFileComparison = computed(() => ({
  extension: currentTransformedAsset.value?.extension,
  size: currentTransformedAsset.value?.size,
  dimensions: activeAssetDimensions.value,
}));
const uploadedVariantItems = computed(() =>
  sortedVariants.value.map((variant) => ({
    assetUuid: variant.assetUuid,
    title: variantTitle(variant),
    extension: variant.extension,
    size: variant.size,
    dimensions: variantDimensions(variant),
    type: variant.type,
    hasAudio: variantHasAudio(variant),
  })),
);

const videoModeOptions = computed(() => ({
  quality: {
    title: 'Качественно',
    description: 'Старательное сжатие VP9.',
  },
  fast: {
    title: 'Быстро',
    description: 'Более легкая обработка для слабого сервера.',
  },
}));

const currentPreview = computed(() => {
  if (previewMode.value === 'asset' && activeAsset.value) {
    const asset = activeAsset.value;
    const src =
      asset.type === AssetType.Video ? asset.videoUrl : asset.assetUrl;
    return {
      key: `asset:${asset.assetUuid}:${asset.assetUrl}`,
      extension: asset.extension,
      src,
      href: asset.assetUrl,
      isMedia: asset.type === AssetType.Image || asset.type === AssetType.Video,
      hasAudio:
        asset.type === AssetType.Video
          ? asset.meta?.audio !== 'none' && asset.meta?.audio !== 'strip'
          : false,
    };
  }

  return {
    key: `original:${props.modalData.file.objectUrl}`,
    extension: props.modalData.file.extension,
    src: props.modalData.file.objectUrl,
    href: props.modalData.file.objectUrl,
    isMedia: isOriginalMedia.value,
    hasAudio: originalAssetType.value === AssetType.Video ? undefined : false,
  };
});
const currentPreviewViewState = computed(() =>
  previewViewStates.get(currentPreview.value.key),
);
const currentPreviewPlaybackState = computed(() =>
  previewPlaybackStates.get(currentPreview.value.key),
);

const qualityValues = computed(() =>
  new Array(91).fill(0).map((_, index) => 10 + index),
);

const currentTransformSettings = computed<AssetTransformSettings | null>(() => {
  if (!canTransform.value) return null;
  const dimensions = {
    width: parseDimension(widthInput.value),
    height: parseDimension(heightInput.value),
  };

  if (originalAssetType.value === AssetType.Image) {
    return createImageTransformSettings(quality.value, dimensions);
  }

  if (originalAssetType.value === AssetType.Video) {
    return createVideoTransformSettings(quality.value, dimensions, {
      audio: muteAudio.value ? 'strip' : 'keep',
      mode: videoConversionMode.value,
    });
  }

  return null;
});

const currentTransformSettingsKey = computed(() =>
  currentTransformSettings.value
    ? buildAssetSettingsKey(currentTransformSettings.value)
    : '',
);

const activeAssetIsTransform = computed(() =>
  isTransformSettings(currentTransformedAsset.value?.settings),
);
const canUseOriginal = computed(
  () =>
    activeUseCandidate.value === 'original' &&
    Boolean(currentOriginalAsset.value) &&
    !busyAction.value,
);
const canUseSelected = computed(
  () =>
    activeUseCandidate.value === 'selected' &&
    Boolean(selectedVariant.value) &&
    !busyAction.value,
);
const canUseTransformed = computed(
  () =>
    activeUseCandidate.value === 'transformed' &&
    activeAssetIsTransform.value &&
    !busyAction.value,
);
const editApplyButtonText = computed(() =>
  busyAction.value === 'apply'
    ? busyText('Загрузка', applyProcessingText())
    : 'Применить',
);

watch(originalDimensions, (dimensions) => {
  if (!dimensions || widthInput.value || heightInput.value) return;
  widthInput.value = String(dimensions.width);
  heightInput.value = String(dimensions.height);
});

onMounted(loadVariants);
onBeforeUnmount(() => {
  activeXhr.value?.abort();
  stopProgressPolling();
  activeXhr.value = null;
});

async function loadVariants() {
  busyAction.value = 'variants';
  errorMessage.value = '';
  try {
    const response = await $fetch<AssetVariantsResponse>(
      '/api/admin/assets/variants',
      {
        method: 'POST',
        body: { rawHash: props.modalData.file.rawHash },
      },
    );
    variants.value = response.variants;
    if (response.variants.length > 0 && !profileSelectedByUser.value) {
      const preferredVariant = [...response.variants].sort(
        (a, b) => a.size - b.size,
      )[0];
      selectedVariantUuid.value = preferredVariant.assetUuid;
      activeAsset.value = preferredVariant;
      activeUseCandidate.value = 'selected';
      activeProfile.value = 'uploaded';
      previewMode.value = 'asset';
    }
  } catch (error) {
    errorMessage.value = errorToMessage(
      error,
      'Failed to load uploaded variants.',
    );
  } finally {
    busyAction.value = undefined;
  }
}

async function uploadOriginal() {
  const settings = createOriginalAssetSettings();
  errorMessage.value = '';
  saveCurrentPreviewViewState();

  const reusableAsset = reusableOriginalAsset.value;
  if (reusableAsset) {
    currentOriginalAsset.value = reusableAsset;
    activeAsset.value = reusableAsset;
    selectedVariantUuid.value = '';
    activeUseCandidate.value = 'original';
    profileSelectedByUser.value = true;
    activeProfile.value = 'original';
    previewMode.value = 'asset';
    return;
  }

  busyAction.value = 'upload-original';
  try {
    const response = await uploadWithSettings(settings);
    currentOriginalAsset.value = response;
    activeAsset.value = response;
    selectedVariantUuid.value = '';
    activeUseCandidate.value = 'original';
    profileSelectedByUser.value = true;
    activeProfile.value = 'original';
    previewMode.value = 'asset';
  } catch (error) {
    errorMessage.value = errorToMessage(
      error,
      'Failed to upload original file.',
    );
  } finally {
    busyAction.value = undefined;
    uploadStatus.value = null;
  }
}

async function applySettings() {
  const settings = currentTransformSettings.value;
  if (!settings) return;

  const currentSettingsKey = currentTransformSettingsKey.value;
  const cachedAsset =
    currentTransformedAsset.value?.settingsKey === currentSettingsKey
      ? currentTransformedAsset.value
      : undefined;
  const matchingVariant = variants.value.find(
    (variant) => variant.settingsKey === currentSettingsKey,
  );
  const reusableAsset = cachedAsset ?? matchingVariant;

  errorMessage.value = '';
  saveCurrentPreviewViewState();

  try {
    if (reusableAsset) {
      currentTransformedAsset.value = reusableAsset;
      activeAsset.value = reusableAsset;
      selectedVariantUuid.value = '';
      activeUseCandidate.value = 'transformed';
      profileSelectedByUser.value = true;
      activeProfile.value = 'edit';
      previewMode.value = 'asset';
      return;
    }

    busyAction.value = 'apply';
    const response = await uploadWithSettings(settings, {
      previousAssetUuid: temporaryAssetUuid.value,
    });
    currentTransformedAsset.value = response;
    activeAsset.value = response;
    selectedVariantUuid.value = '';
    activeUseCandidate.value = 'transformed';
    profileSelectedByUser.value = true;
    activeProfile.value = 'edit';
    previewMode.value = 'asset';
    temporaryAssetUuid.value = response.created ? response.assetUuid : null;
  } catch (error) {
    errorMessage.value = errorToMessage(error, 'Failed to apply settings.');
  } finally {
    busyAction.value = undefined;
    uploadStatus.value = null;
  }
}

function selectVariant(variant: AssetVariantInfo) {
  saveCurrentPreviewViewState();
  selectedVariantUuid.value = variant.assetUuid;
  activeAsset.value = variant;
  activeUseCandidate.value = 'selected';
  profileSelectedByUser.value = true;
  activeProfile.value = 'uploaded';
  previewMode.value = 'asset';
}

function selectVariantByUuid(assetUuid: string) {
  const variant = variants.value.find((item) => item.assetUuid === assetUuid);
  if (variant) selectVariant(variant);
}

async function finishSelectedVariant() {
  if (canUseSelected.value && selectedVariant.value) {
    await finishWithAsset(selectedVariant.value);
  }
}

async function finishWithTransformed() {
  if (canUseTransformed.value && currentTransformedAsset.value) {
    await finishWithAsset(currentTransformedAsset.value);
  }
}

async function finishWithOriginal() {
  if (canUseOriginal.value && currentOriginalAsset.value) {
    await finishWithAsset(currentOriginalAsset.value);
  }
}

async function finishWithAsset(asset: AssetVariantInfo) {
  await discardTemporaryExcept(asset.assetUuid);
  temporaryAssetUuid.value = null;
  emit('modalResult', {
    type: 'asset-ready',
    asset,
  });
}

function setActiveProfile(profile: ActiveProfile) {
  saveCurrentPreviewViewState();
  profileSelectedByUser.value = true;
  activeProfile.value = profile;
  if (profile === 'original') {
    previewMode.value = reusableOriginalAsset.value ? 'asset' : 'original';
    if (reusableOriginalAsset.value) {
      currentOriginalAsset.value = reusableOriginalAsset.value;
      activeAsset.value = reusableOriginalAsset.value;
      selectedVariantUuid.value = '';
      activeUseCandidate.value = 'original';
    }
  }
}

async function uploadWithSettings(
  settings: AssetUploadSettings,
  options: { previousAssetUuid?: string | null } = {},
): Promise<AssetUploadResponse> {
  const formData = new FormData();
  formData.append('file', props.modalData.file.file, props.modalData.file.name);
  formData.append('rawHash', props.modalData.file.rawHash);
  formData.append('settings', JSON.stringify(settings));
  const uploadId = crypto.randomUUID();
  formData.append('uploadId', uploadId);

  if (props.modalData.maxSize !== undefined) {
    formData.append('maxSizeBytes', String(props.modalData.maxSize));
  }

  if (props.modalData.acceptedExtensions) {
    formData.append(
      'acceptedExtensions',
      props.modalData.acceptedExtensions === '*'
        ? '*'
        : JSON.stringify(props.modalData.acceptedExtensions),
    );
  }

  if (options.previousAssetUuid) {
    formData.append('previousAssetUuid', options.previousAssetUuid);
  }

  return await new Promise<AssetUploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    activeXhr.value = xhr;
    uploadStatus.value = { phase: 'uploading' };
    xhr.open('POST', '/api/admin/assets/upload');

    xhr.upload.addEventListener('progress', (event) => {
      uploadStatus.value = {
        phase: 'uploading',
        progress: event.lengthComputable
          ? Math.max(0, Math.min(1, event.loaded / event.total))
          : undefined,
      };
    });

    xhr.upload.addEventListener('load', () => {
      uploadStatus.value = { phase: 'processing' };
      startProgressPolling(uploadId);
    });

    xhr.addEventListener('load', () => {
      activeXhr.value = null;
      stopProgressPolling();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as AssetUploadResponse);
        } catch {
          reject(new Error('Invalid server response.'));
        }
        return;
      }

      reject(new Error(readXhrErrorMessage(xhr)));
    });

    xhr.addEventListener('error', () => {
      activeXhr.value = null;
      stopProgressPolling();
      reject(new Error('Network error.'));
    });

    xhr.addEventListener('abort', () => {
      activeXhr.value = null;
      stopProgressPolling();
      reject(new Error('Upload cancelled.'));
    });

    xhr.send(formData);
  });
}

async function discardTemporaryExcept(assetUuidToKeep: string) {
  const assetUuid = temporaryAssetUuid.value;
  if (!assetUuid || assetUuid === assetUuidToKeep) return;

  await $fetch('/api/admin/assets/discard', {
    method: 'POST',
    body: { assetUuid },
  }).catch(() => {});
  variants.value = variants.value.filter(
    (variant) => variant.assetUuid !== assetUuid,
  );
  if (activeAsset.value?.assetUuid === assetUuid) {
    activeAsset.value = null;
    previewMode.value = 'original';
  }
  if (currentTransformedAsset.value?.assetUuid === assetUuid) {
    currentTransformedAsset.value = null;
  }
  if (
    activeUseCandidate.value === 'transformed' &&
    !currentTransformedAsset.value
  ) {
    activeUseCandidate.value = null;
  }
  temporaryAssetUuid.value = null;
}

function startProgressPolling(uploadId: string) {
  stopProgressPolling();
  progressPollTimer = setInterval(async () => {
    try {
      const progress = await $fetch<UploadStatus | null>(
        `/api/admin/assets/upload-progress/${uploadId}`,
      );
      if (progress) uploadStatus.value = progress;
    } catch {
      // Upload errors are handled by the main request.
    }
  }, 500);
}

function stopProgressPolling() {
  if (!progressPollTimer) return;
  clearInterval(progressPollTimer);
  progressPollTimer = undefined;
}

function applyRecommendedSettings() {
  quality.value = originalAssetType.value === AssetType.Video ? 40 : 60;
  const dimensions = originalDimensions.value;
  if (!dimensions) return;

  const longSide = Math.max(dimensions.width, dimensions.height);
  if (longSide <= 1280) {
    widthInput.value = String(dimensions.width);
    heightInput.value = String(dimensions.height);
    return;
  }

  const scale = 1280 / longSide;
  widthInput.value = String(Math.max(1, Math.round(dimensions.width * scale)));
  heightInput.value = String(
    Math.max(1, Math.round(dimensions.height * scale)),
  );
}

function togglePreviewMode() {
  saveCurrentPreviewViewState();
  previewMode.value = previewMode.value === 'original' ? 'asset' : 'original';
}

function saveCurrentPreviewViewState() {
  const state = mediaPreview.value?.getViewState();
  if (state) {
    previewViewStates.set(currentPreview.value.key, state);
  }
  const playbackState = mediaPreview.value?.getPlaybackState();
  if (playbackState) {
    previewPlaybackStates.set(currentPreview.value.key, playbackState);
  }
}

function syncHeightFromWidth() {
  if (!keepAspect.value || !originalDimensions.value) return;
  const width = parseDimension(widthInput.value);
  if (!width) return;
  heightInput.value = String(
    Math.max(
      1,
      Math.round(
        (width * originalDimensions.value.height) /
          originalDimensions.value.width,
      ),
    ),
  );
}

function syncWidthFromHeight() {
  if (!keepAspect.value || !originalDimensions.value) return;
  const height = parseDimension(heightInput.value);
  if (!height) return;
  widthInput.value = String(
    Math.max(
      1,
      Math.round(
        (height * originalDimensions.value.width) /
          originalDimensions.value.height,
      ),
    ),
  );
}

function parseDimension(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function variantDimensions(variant: AssetVariantInfo) {
  const meta = variant.meta;
  if (!meta || !('width' in meta) || !('height' in meta)) return undefined;
  const width = meta.width;
  const height = meta.height;
  return width && height ? { width, height } : undefined;
}

function variantHasAudio(variant: AssetVariantInfo): boolean | undefined {
  if (variant.type !== AssetType.Video) return undefined;
  if (!variant.meta?.audio || variant.meta.audio === 'unknown') {
    return undefined;
  }
  return variant.meta.audio !== 'none' && variant.meta.audio !== 'strip';
}

function variantTitle(variant: AssetVariantInfo): string {
  if (variant.isOriginal) {
    return 'Оригинал';
  }
  if (isTransformSettings(variant.settings)) {
    return modifiedVariantNames.value.get(variant.assetUuid) ?? 'Измененный';
  }
  return 'Uploaded file';
}

function isTransformSettings(
  settings: AssetUploadSettings | null | undefined,
): settings is AssetTransformSettings {
  return (
    settings?.type === 'image-transform' || settings?.type === 'video-transform'
  );
}

function busyText(uploading: string, processing: string): string {
  if (!uploadStatus.value) return uploading;
  if (uploadStatus.value.phase === 'processing') {
    return uploadStatus.value.progress !== undefined
      ? `${processing} ${Math.round(uploadStatus.value.progress * 100)}%`
      : processing;
  }

  return uploading;
}

function readXhrErrorMessage(xhr: XMLHttpRequest): string {
  try {
    const response = JSON.parse(xhr.responseText) as { message?: string };
    return response.message ?? `Request failed (${xhr.status})`;
  } catch {
    return `Request failed (${xhr.status})`;
  }
}

function applyProcessingText(): string {
  return originalAssetType.value === AssetType.Video
    ? 'Видео...'
    : 'Обработка...';
}

function buttonIcon(action: BusyAction, fallback: 'cloud-upload' | 'eye-open') {
  return busyAction.value === action ? 'loading' : fallback;
}

function errorToMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { message?: string } }).data;
    return data?.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
</script>

<template>
  <AssetModal :aside-title="phrase.upload_variants">
    <template #preview>
      <AssetModalPreviewMedia
        v-if="currentPreview.isMedia"
        :key="`media:${currentPreview.key}`"
        ref="mediaPreview"
        :extension="currentPreview.extension"
        :src="currentPreview.src"
        :has-audio="currentPreview.hasAudio"
        :initial-view-state="currentPreviewViewState"
        :initial-playback-state="currentPreviewPlaybackState"
      />
      <AssetModalPreviewFile
        v-else
        :key="`file:${currentPreview.key}`"
        :extension="currentPreview.extension"
      />
    </template>

    <template #buttons>
      <AssetModalButton
        :key="`direct:${currentPreview.href}`"
        icon="arrow-outward"
        target="_blank"
        :href="currentPreview.href"
        :data-title-popup="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="activeAsset"
        @click="togglePreviewMode"
        :data-title-popup="
          previewMode === 'original'
            ? 'Show uploaded preview'
            : 'Show original preview'
        "
      >
        <span class="text-xs font-bold transition">
          {{ previewMode === 'original' ? 'NEW' : 'ORG' }}
        </span>
      </AssetModalButton>
      <AssetModalButton
        v-if="currentPreview.isMedia"
        @click="mediaPreview?.handleZoomButtonClick()"
      >
        <span class="text-xs font-bold transition">
          {{ mediaPreview?.zoomPercent ?? 100 }}%
        </span>
      </AssetModalButton>
    </template>

    <template #aside>
      <div class="flex flex-col">
        <div v-if="errorMessage" class="p-sm">
          <div
            class="rounded-normal border border-border-error bg-bg-error p-sm
              text-sm text-text-error"
          >
            <Icon name="warning" class="mr-xs" />
            <span>{{ errorMessage }}</span>
          </div>
        </div>

        <div class="p-sm pb-0">
          <Button
            variant="secondary"
            class="w-full"
            @click="emit('modalResult', { type: 'upload-new' })"
          >
            <Icon name="file" class="mr-xs" />
            <span>{{ phrase.pick_another_file }}</span>
          </Button>
        </div>

        <UploadSettingsDivider />

        <UploadSettingsSection
          :active="activeProfile === 'original'"
          title="Оригинальный файл"
          @activate="setActiveProfile('original')"
        >
          <AssetModalFileInfo
            :name="modalData.file.name"
            :extension="modalData.file.extension"
            :size="modalData.file.size"
            :dimensions="originalDimensions"
          />

          <Button
            variant="secondary"
            :disabled="Boolean(busyAction)"
            @click="uploadOriginal"
          >
            <Icon
              :name="buttonIcon('upload-original', 'cloud-upload')"
              class="mr-xs"
            />
            <span>
              {{
                busyAction === 'upload-original'
                  ? busyText('Загрузка', 'Сохранение...')
                  : reusableOriginalAsset
                    ? 'Показать оригинал'
                    : 'Загрузить'
              }}
            </span>
          </Button>
          <Button
            variant="primary"
            :disabled="!canUseOriginal"
            class="font-semibold"
            @click="finishWithOriginal"
          >
            <span>Использовать</span>
            <Icon name="chevron-right" class="ml-xs" />
          </Button>
        </UploadSettingsSection>

        <UploadSettingsDivider v-if="hasUploadedVariants" />

        <UploadSettingsSection
          v-if="hasUploadedVariants"
          :active="activeProfile === 'uploaded'"
          title="Файл уже загружен"
          @activate="setActiveProfile('uploaded')"
        >
          <template #header-extra>
            <Icon
              v-if="busyAction === 'variants'"
              name="loading"
              class="text-text-2"
            />
          </template>

          <UploadSettingsVariantList
            v-if="uploadedVariantItems.length"
            :items="uploadedVariantItems"
            :selected-uuid="selectedVariantUuid"
            @select="selectVariantByUuid"
          />
          <div v-else class="text-sm text-text-3">
            {{ busyAction === 'variants' ? 'Ищу...' : 'Совпадений пока нет' }}
          </div>

          <Button
            variant="primary"
            :disabled="!canUseSelected"
            class="font-semibold"
            @click="finishSelectedVariant"
          >
            <span>Использовать</span>
            <Icon name="chevron-right" class="ml-xs" />
          </Button>
        </UploadSettingsSection>

        <template v-if="canTransform">
          <UploadSettingsDivider />

          <UploadSettingsSection
            :active="activeProfile === 'edit'"
            title="Изменить файл"
            @activate="setActiveProfile('edit')"
          >
            <UploadSettingsEditProfile
              v-model:quality="quality"
              v-model:width-input="widthInput"
              v-model:height-input="heightInput"
              v-model:keep-aspect="keepAspect"
              v-model:mute-audio="muteAudio"
              v-model:video-conversion-mode="videoConversionMode"
              :is-video="originalAssetType === AssetType.Video"
              :quality-values="qualityValues"
              :video-mode-options="videoModeOptions"
              :busy-action="busyAction"
              :apply-button-text="editApplyButtonText"
              :can-use-transformed="canUseTransformed"
              :show-result="
                activeAssetIsTransform && Boolean(currentTransformedAsset)
              "
              :previous-file="originalFileComparison"
              :current-file="transformedFileComparison"
              @apply-recommended-settings="applyRecommendedSettings"
              @sync-height-from-width="syncHeightFromWidth"
              @sync-width-from-height="syncWidthFromHeight"
              @apply-settings="applySettings"
              @finish="finishWithTransformed"
            />
          </UploadSettingsSection>
        </template>
      </div>
    </template>
  </AssetModal>
</template>
