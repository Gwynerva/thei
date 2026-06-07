<script lang="ts" setup>
import type {
  AssetVariantInfo,
  AssetWizardResult,
} from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import {
  buildAssetSettingsKey,
  createFileZipSettings,
  createImageTransformSettings,
  createOriginalAssetSettings,
  createVideoTransformSettings,
  type AssetFileZipSettings,
  type AssetTransformSettings,
  type AssetUploadDimensions,
  type AssetUploadSettings,
} from '#layers/thei/shared/asset-upload-settings';
import {
  calculatePreviewDimensions,
  dimensionsEqual,
  evenDimensions,
  getAvailableAssetSizePresets,
  parseAssetDimensionInput,
  resizeDimensionsByLongSide,
  type FileDimensions,
} from '#layers/thei/shared/asset-upload-dimensions';
import { getAssetUploadProfileConfig } from '#layers/thei/shared/asset-upload-profiles';
import { canZipAssetExtension } from '#layers/thei/shared/asset-upload-zip';
import {
  imageExtensionProfile,
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import AssetModal from '../asset-modal/AssetModal.vue';
import AssetModalButton from '../asset-modal/AssetModalButton.vue';
import AssetModalCompareMedia from '../asset-modal/AssetModalCompareMedia.vue';
import AssetModalFileInfo from '../asset-modal/AssetModalFileInfo.vue';
import AssetModalPreviewFile from '../asset-modal/AssetModalPreviewFile.vue';
import AssetModalPreviewMedia from '../asset-modal/AssetModalPreviewMedia.vue';
import { useFileInfo } from '../asset-modal/use-file-info';
import UploadSettingsDivider from './UploadSettingsDivider.vue';
import UploadSettingsEditProfile from './UploadSettingsEditProfile.vue';
import UploadSettingsOtherProfile from './UploadSettingsOtherProfile.vue';
import UploadSettingsSection from './UploadSettingsSection.vue';
import UploadSettingsVariantList from './UploadSettingsVariantList.vue';
import {
  useUploadSettingsAssets,
  type UploadSettingsBusyAction,
  type UploadSettingsModalData,
} from './use-upload-settings-assets';

type UploadSettingsResult = { type: 'upload-new' } | AssetWizardResult;
type UseCandidate = 'original' | 'transformed' | 'selected' | null;
type ActiveProfile = 'original' | 'uploaded' | 'edit';
type EditableSettings = AssetTransformSettings | AssetFileZipSettings;
interface PreviewSource {
  key: string;
  extension: string;
  src: string;
  href: string;
  isMedia: boolean;
  hasAudio?: boolean;
  displayDimensions?: FileDimensions;
}

const emit = defineEmits<{
  modalResult: [result: UploadSettingsResult];
}>();

const props = defineProps<{
  modalData: UploadSettingsModalData;
}>();

const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');

const {
  busyAction,
  uploadStatus,
  variants,
  temporaryAssetUuid,
  loadVariants,
  uploadWithSettings,
  discardTemporaryExcept,
} = useUploadSettingsAssets(props.modalData);

const errorMessage = ref('');
const selectedVariantUuid = ref('');
const currentOriginalAsset = shallowRef<AssetVariantInfo | null>(null);
const currentTransformedAsset = shallowRef<AssetVariantInfo | null>(null);
const activeUseCandidate = ref<UseCandidate>(null);
const activeProfile = ref<ActiveProfile>('original');
const profileSelectedByUser = ref(false);

const quality = ref(70);
const widthInput = ref('');
const heightInput = ref('');
const keepAspect = ref(true);
const muteAudio = ref(false);
const fastConversion = ref(false);
const resizeMode = ref<'inside' | 'cover'>('inside');
const allowUpscale = ref(false);
let syncingDimensions = false;
let originalDimensionsAppliedAsDefault = false;

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

const profileConfig = computed(() =>
  getAssetUploadProfileConfig(props.modalData.uploadProfile),
);

const isOriginalMedia = computed(
  () =>
    originalAssetType.value === AssetType.Image ||
    originalAssetType.value === AssetType.Video,
);
const canTransform = computed(() => isOriginalMedia.value);
const canZipOriginalFile = computed(
  () =>
    originalAssetType.value === AssetType.Other &&
    canZipAssetExtension(props.modalData.file.extension),
);
const canEditFile = computed(
  () => canTransform.value || canZipOriginalFile.value,
);

const { dimensions: originalDimensions } = useFileInfo(
  props.modalData.file.objectUrl,
  props.modalData.file.extension,
);

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
    .filter((variant) => isEditableSettings(variant.settings))
    .forEach((variant, index) => {
      names.set(
        variant.assetUuid,
        phrase.value.upload_variant_modified(index + 1),
      );
    });
  return names;
});

const parsedDimensions = computed<AssetUploadDimensions>(() =>
  normalizeDimensionsForCurrentType({
    width: parseAssetDimensionInput(widthInput.value),
    height: parseAssetDimensionInput(heightInput.value),
  }),
);
const originalDimensionsForComparison = computed(() =>
  originalDimensions.value
    ? normalizeDimensionsForCurrentType(originalDimensions.value)
    : undefined,
);
const previewDimensions = computed(() =>
  calculatePreviewDimensions(originalDimensions.value, parsedDimensions.value),
);
const availableSizePresets = computed(() =>
  getAvailableAssetSizePresets(originalDimensions.value),
);
const showResetDimensions = computed(
  () =>
    Boolean(originalDimensionsForComparison.value) &&
    !dimensionsEqual(
      parsedDimensions.value,
      originalDimensionsForComparison.value,
    ),
);

const recommendedEditSettings = computed<EditableSettings | null>(() => {
  if (canZipOriginalFile.value) {
    return createFileZipSettings();
  }

  if (!canTransform.value) return null;

  const configured = profileConfig.value;
  const dimensions = configured?.dimensions ?? originalDimensions.value;

  if (!dimensions) return null;

  const isVideo = originalAssetType.value === AssetType.Video;
  const settingsDimensions = isVideo ? evenDimensions(dimensions) : dimensions;
  const imageQuality = configured?.imageQuality ?? 70;
  const videoQuality = configured?.videoQuality ?? 70;
  const common = {
    resizeMode: configured?.resizeMode ?? 'inside',
    allowUpscale: configured?.allowUpscale ?? false,
  } as const;

  if (originalAssetType.value === AssetType.Image) {
    return createImageTransformSettings(
      imageQuality,
      settingsDimensions,
      common,
    );
  }

  return createVideoTransformSettings(videoQuality, settingsDimensions, {
    ...common,
    stripAudio: configured?.stripAudio ?? false,
    fastConversion: false,
  });
});

const currentEditSettings = computed<EditableSettings | null>(() => {
  if (canZipOriginalFile.value) {
    return createFileZipSettings();
  }

  if (!canTransform.value) return null;

  if (originalAssetType.value === AssetType.Image) {
    return createImageTransformSettings(quality.value, parsedDimensions.value, {
      resizeMode: resizeMode.value,
      allowUpscale: allowUpscale.value,
    });
  }

  return createVideoTransformSettings(quality.value, parsedDimensions.value, {
    resizeMode: resizeMode.value,
    allowUpscale: allowUpscale.value,
    stripAudio: muteAudio.value,
    fastConversion: fastConversion.value,
  });
});

const currentEditSettingsKey = computed(() =>
  currentEditSettings.value
    ? buildAssetSettingsKey(currentEditSettings.value)
    : '',
);
const recommendedEditSettingsKey = computed(() =>
  recommendedEditSettings.value
    ? buildAssetSettingsKey(recommendedEditSettings.value)
    : '',
);
const showRecommendedButton = computed(
  () =>
    Boolean(profileConfig.value) &&
    Boolean(currentEditSettingsKey.value) &&
    currentEditSettingsKey.value !== recommendedEditSettingsKey.value,
);

const transformedAssetIsEdit = computed(() =>
  isEditableSettings(currentTransformedAsset.value?.settings),
);
const currentTransformedAssetMatchesSettings = computed(
  () =>
    transformedAssetIsEdit.value &&
    Boolean(currentEditSettingsKey.value) &&
    currentTransformedAsset.value?.settingsKey === currentEditSettingsKey.value,
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
    currentTransformedAssetMatchesSettings.value &&
    !busyAction.value,
);
const editApplyButtonText = computed(() =>
  busyAction.value === 'apply'
    ? busyText(phrase.value.upload_uploading, phrase.value.upload_processing)
    : canZipOriginalFile.value
      ? phrase.value.upload_compress_to_zip
      : phrase.value.upload_apply_settings,
);

const transformedAssetDimensions = computed(() =>
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
  extension:
    currentTransformedAssetMatchesSettings.value &&
    currentTransformedAsset.value
      ? currentTransformedAsset.value.extension
      : expectedEditExtension.value,
  size: currentTransformedAssetMatchesSettings.value
    ? currentTransformedAsset.value?.size
    : undefined,
  dimensions:
    currentTransformedAssetMatchesSettings.value &&
    transformedAssetDimensions.value
      ? transformedAssetDimensions.value
      : previewDimensions.value,
}));
const expectedEditExtension = computed(() => {
  if (canZipOriginalFile.value) return 'zip';
  if (originalAssetType.value === AssetType.Image) return 'webp';
  if (originalAssetType.value === AssetType.Video) return 'webm';
  return props.modalData.file.extension;
});
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

const originalPreviewSource = computed<PreviewSource>(() => ({
  key: `original:${props.modalData.file.objectUrl}:native`,
  extension: props.modalData.file.extension,
  src: props.modalData.file.objectUrl,
  href: props.modalData.file.objectUrl,
  isMedia: isOriginalMedia.value,
  hasAudio: originalAssetType.value === AssetType.Video ? undefined : false,
  displayDimensions: originalDimensions.value,
}));
const modifiedPreviewSource = computed<PreviewSource | null>(() => {
  if (activeProfile.value === 'original') return null;

  if (activeProfile.value === 'uploaded') {
    if (selectedVariant.value?.isOriginal) return null;
    return selectedVariant.value
      ? variantPreviewSource(selectedVariant.value)
      : null;
  }

  if (activeProfile.value !== 'edit') return null;

  if (
    currentTransformedAssetMatchesSettings.value &&
    currentTransformedAsset.value
  ) {
    return variantPreviewSource(currentTransformedAsset.value);
  }

  if (!isOriginalMedia.value || !showResetDimensions.value) return null;

  const display = previewDimensions.value;
  const displayKey = display ? `${display.width}x${display.height}` : 'native';
  return {
    key: `edit-preview:${props.modalData.file.objectUrl}:${displayKey}`,
    extension: props.modalData.file.extension,
    src: props.modalData.file.objectUrl,
    href: props.modalData.file.objectUrl,
    isMedia: true,
    hasAudio: originalAssetType.value === AssetType.Video ? undefined : false,
    displayDimensions: display,
  };
});
const comparePreview = computed(() => {
  const modified = modifiedPreviewSource.value;
  if (!originalPreviewSource.value.isMedia || !modified?.isMedia) return null;

  return {
    key: `${originalPreviewSource.value.key}|${modified.key}`,
    original: originalPreviewSource.value,
    modified,
  };
});
const disableSeamlessCompare = computed(
  () =>
    activeProfile.value === 'edit' &&
    showResetDimensions.value &&
    !currentTransformedAssetMatchesSettings.value,
);
const singlePreview = computed(() =>
  activeProfile.value === 'original' && reusableOriginalAsset.value
    ? variantPreviewSource(reusableOriginalAsset.value)
    : activeProfile.value === 'uploaded' && selectedVariant.value?.isOriginal
      ? variantPreviewSource(selectedVariant.value)
      : (modifiedPreviewSource.value ?? originalPreviewSource.value),
);
const directPreviewHref = computed(
  () => comparePreview.value?.modified.href ?? singlePreview.value.href,
);
const qualityValues = computed(() =>
  new Array(91).fill(0).map((_, index) => 10 + index),
);

watch(
  recommendedEditSettings,
  (settings) => {
    if (!settings || profileSelectedByUser.value) return;
    applyEditSettings(settings);
  },
  { immediate: true },
);

watch(
  originalDimensionsForComparison,
  (dimensions) => {
    if (
      !dimensions ||
      profileConfig.value ||
      originalDimensionsAppliedAsDefault
    ) {
      return;
    }
    originalDimensionsAppliedAsDefault = true;
    setDimensionInputs(dimensions);
  },
  { immediate: true },
);

watch(widthInput, () => {
  if (syncingDimensions || !keepAspect.value) return;
  syncHeightFromWidth();
});
watch(heightInput, () => {
  if (syncingDimensions || !keepAspect.value) return;
  syncWidthFromHeight();
});
onMounted(async () => {
  try {
    const loadedVariants = await loadVariants();
    if (loadedVariants.length > 0 && !profileSelectedByUser.value) {
      const preferredVariant = [...loadedVariants].sort(
        (a, b) => a.size - b.size,
      )[0]!;
      selectedVariantUuid.value = preferredVariant.assetUuid;
      activeUseCandidate.value = 'selected';
      activeProfile.value = 'uploaded';
    }
  } catch (error) {
    errorMessage.value = errorToMessage(
      error,
      phrase.value.upload_error_load_variants,
    );
  }
});

async function uploadOriginal() {
  const settings = createOriginalAssetSettings();
  errorMessage.value = '';

  const reusableAsset = reusableOriginalAsset.value;
  if (reusableAsset) {
    currentOriginalAsset.value = reusableAsset;
    selectedVariantUuid.value = '';
    activeUseCandidate.value = 'original';
    profileSelectedByUser.value = true;
    activeProfile.value = 'original';
    return;
  }

  busyAction.value = 'upload-original';
  try {
    const response = await uploadWithSettings(settings);
    currentOriginalAsset.value = response;
    selectedVariantUuid.value = '';
    activeUseCandidate.value = 'original';
    profileSelectedByUser.value = true;
    activeProfile.value = 'original';
  } catch (error) {
    errorMessage.value = errorToMessage(
      error,
      phrase.value.upload_error_original,
    );
  } finally {
    busyAction.value = undefined;
    uploadStatus.value = null;
  }
}

async function applySettings() {
  const settings = currentEditSettings.value;
  if (!settings) return;

  const currentSettingsKey = currentEditSettingsKey.value;
  const cachedAsset =
    currentTransformedAsset.value?.settingsKey === currentSettingsKey
      ? currentTransformedAsset.value
      : undefined;
  const matchingVariant = variants.value.find(
    (variant) => variant.settingsKey === currentSettingsKey,
  );
  const reusableAsset = cachedAsset ?? matchingVariant;

  errorMessage.value = '';

  try {
    if (reusableAsset) {
      currentTransformedAsset.value = reusableAsset;
      selectedVariantUuid.value = '';
      activeUseCandidate.value = 'transformed';
      profileSelectedByUser.value = true;
      activeProfile.value = 'edit';
      return;
    }

    busyAction.value = 'apply';
    const response = await uploadWithSettings(settings, {
      previousAssetUuid: temporaryAssetUuid.value,
    });
    currentTransformedAsset.value = response;
    selectedVariantUuid.value = '';
    activeUseCandidate.value = 'transformed';
    profileSelectedByUser.value = true;
    activeProfile.value = 'edit';
    temporaryAssetUuid.value = response.created ? response.assetUuid : null;
  } catch (error) {
    errorMessage.value = errorToMessage(error, phrase.value.upload_error_apply);
  } finally {
    busyAction.value = undefined;
    uploadStatus.value = null;
  }
}

function selectVariant(variant: AssetVariantInfo) {
  selectedVariantUuid.value = variant.assetUuid;
  activeUseCandidate.value = 'selected';
  profileSelectedByUser.value = true;
  activeProfile.value = 'uploaded';
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
  const discardedUuid = await discardTemporaryExcept(asset.assetUuid);
  if (discardedUuid) cleanupDiscardedTemporary(discardedUuid);
  emit('modalResult', {
    type: 'asset-ready',
    asset,
  });
}

function setActiveProfile(profile: ActiveProfile) {
  profileSelectedByUser.value = true;
  activeProfile.value = profile;
  if (profile === 'original') {
    if (reusableOriginalAsset.value) {
      currentOriginalAsset.value = reusableOriginalAsset.value;
      selectedVariantUuid.value = '';
      activeUseCandidate.value = 'original';
    }
  }
}

function cleanupDiscardedTemporary(assetUuid: string) {
  if (currentTransformedAsset.value?.assetUuid === assetUuid) {
    currentTransformedAsset.value = null;
  }
  if (
    activeUseCandidate.value === 'transformed' &&
    !currentTransformedAsset.value
  ) {
    activeUseCandidate.value = null;
  }
}

function applyRecommendedSettings() {
  if (!recommendedEditSettings.value) return;
  applyEditSettings(recommendedEditSettings.value);
}

function applyEditSettings(settings: EditableSettings) {
  if (settings.type === 'file-zip') return;

  quality.value = settings.quality;
  resizeMode.value = settings.resizeMode;
  allowUpscale.value = settings.allowUpscale;
  setDimensionInputs(settings.dimensions);

  if (settings.type === 'video-transform') {
    muteAudio.value = settings.stripAudio;
    fastConversion.value = settings.fastConversion;
  }
}

function applySizePreset(size: number) {
  const dimensions = originalDimensions.value;
  if (!dimensions) return;
  setDimensionInputs(resizeDimensionsByLongSide(dimensions, size));
}

function resetDimensions() {
  if (!originalDimensions.value) return;
  setDimensionInputs(
    normalizeDimensionsForCurrentType(originalDimensions.value),
  );
}

function syncHeightFromWidth() {
  if (!keepAspect.value || !originalDimensions.value) return;
  const width = parseAssetDimensionInput(widthInput.value);
  if (!width) return;
  const height = Math.max(
    1,
    Math.round(
      (width * originalDimensions.value.height) /
        originalDimensions.value.width,
    ),
  );
  setDimensionInputs({ width, height });
}

function syncWidthFromHeight() {
  if (!keepAspect.value || !originalDimensions.value) return;
  const height = parseAssetDimensionInput(heightInput.value);
  if (!height) return;
  const width = Math.max(
    1,
    Math.round(
      (height * originalDimensions.value.width) /
        originalDimensions.value.height,
    ),
  );
  setDimensionInputs({ width, height });
}

function setDimensionInputs(dimensions: AssetUploadDimensions) {
  syncingDimensions = true;
  widthInput.value = dimensions.width ? String(dimensions.width) : '';
  heightInput.value = dimensions.height ? String(dimensions.height) : '';
  void nextTick(() => {
    syncingDimensions = false;
  });
}

function normalizeDimensionsForCurrentType(
  dimensions: AssetUploadDimensions,
): AssetUploadDimensions {
  if (originalAssetType.value !== AssetType.Video) return dimensions;
  return {
    ...(dimensions.width
      ? { width: Math.max(2, dimensions.width - (dimensions.width % 2)) }
      : {}),
    ...(dimensions.height
      ? { height: Math.max(2, dimensions.height - (dimensions.height % 2)) }
      : {}),
  };
}

function variantPreviewSource(variant: AssetVariantInfo): PreviewSource {
  const isMedia =
    variant.type === AssetType.Image || variant.type === AssetType.Video;
  return {
    key: `asset:${variant.assetUuid}:${variant.assetUrl}`,
    extension: variant.extension,
    src: variant.type === AssetType.Video ? variant.videoUrl : variant.assetUrl,
    href: variant.assetUrl,
    isMedia,
    hasAudio:
      variant.type === AssetType.Video ? variantHasAudio(variant) : false,
    displayDimensions: variantDimensions(variant),
  };
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
    return phrase.value.upload_variant_original;
  }
  if (isEditableSettings(variant.settings)) {
    return (
      modifiedVariantNames.value.get(variant.assetUuid) ??
      phrase.value.upload_variant_modified(1)
    );
  }
  return phrase.value.upload_variant_uploaded_file;
}

function isEditableSettings(
  settings: AssetUploadSettings | null | undefined,
): settings is EditableSettings {
  return (
    settings?.type === 'image-transform' ||
    settings?.type === 'video-transform' ||
    settings?.type === 'file-zip'
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

function buttonIcon(
  action: UploadSettingsBusyAction,
  fallback: 'cloud-upload' | 'eye-open',
) {
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
      <AssetModalCompareMedia
        v-if="comparePreview"
        :key="`compare:${comparePreview.key}`"
        :original="comparePreview.original"
        :modified="comparePreview.modified"
        :original-label="phrase.upload_compare_original"
        :modified-label="phrase.upload_compare_modified"
        :disable-seamless="disableSeamlessCompare"
      />
      <AssetModalPreviewMedia
        v-else-if="singlePreview.isMedia"
        :key="`media:${singlePreview.key}`"
        ref="mediaPreview"
        :extension="singlePreview.extension"
        :src="singlePreview.src"
        :has-audio="singlePreview.hasAudio"
        :display-dimensions="singlePreview.displayDimensions"
      />
      <AssetModalPreviewFile
        v-else
        :key="`file:${singlePreview.key}`"
        :extension="singlePreview.extension"
      />
    </template>

    <template #buttons>
      <AssetModalButton
        :key="`direct:${directPreviewHref}`"
        icon="arrow-outward"
        target="_blank"
        :href="directPreviewHref"
        :data-title-popup="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="!comparePreview && singlePreview.isMedia"
        @click="mediaPreview?.handleZoomButtonClick()"
      >
        <span class="text-xs font-bold transition">
          {{ mediaPreview?.zoomPercent ?? 100 }}%
        </span>
      </AssetModalButton>
    </template>

    <template #aside>
      <div class="flex flex-col">
        <div class="p-sm">
          <Button
            variant="secondary"
            class="w-full"
            @click="emit('modalResult', { type: 'upload-new' })"
          >
            <Icon name="file" class="mr-xs" />
            <span>{{ phrase.pick_another_file }}</span>
          </Button>
        </div>

        <div
          v-if="errorMessage"
          class="relative top-px border-y border-border-error bg-bg-error p-sm
            text-sm text-text-error"
        >
          <Icon name="warning" class="mr-xs" />
          <span>{{ errorMessage }}</span>
        </div>

        <UploadSettingsDivider />

        <UploadSettingsSection
          :active="activeProfile === 'original'"
          :title="phrase.upload_section_original"
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
                  ? busyText(
                      phrase.upload_uploading_original,
                      phrase.upload_saving,
                    )
                  : reusableOriginalAsset
                    ? phrase.upload_show_original
                    : phrase.upload_upload_original
              }}
            </span>
          </Button>
          <Button
            variant="primary"
            :disabled="!canUseOriginal"
            class="font-semibold"
            @click="finishWithOriginal"
          >
            <span>{{ phrase.upload_use }}</span>
            <Icon name="chevron-right" class="ml-xs" />
          </Button>
        </UploadSettingsSection>

        <UploadSettingsDivider v-if="hasUploadedVariants" />

        <UploadSettingsSection
          v-if="hasUploadedVariants"
          :active="activeProfile === 'uploaded'"
          :title="phrase.upload_section_existing"
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
            {{
              busyAction === 'variants'
                ? phrase.upload_searching
                : phrase.upload_no_matches
            }}
          </div>

          <Button
            variant="primary"
            :disabled="!canUseSelected"
            class="font-semibold"
            @click="finishSelectedVariant"
          >
            <span>{{ phrase.upload_use }}</span>
            <Icon name="chevron-right" class="ml-xs" />
          </Button>
        </UploadSettingsSection>

        <template v-if="canEditFile">
          <UploadSettingsDivider />

          <UploadSettingsSection
            :active="activeProfile === 'edit'"
            :title="
              canZipOriginalFile
                ? phrase.upload_section_zip
                : phrase.upload_section_edit
            "
            @activate="setActiveProfile('edit')"
          >
            <UploadSettingsEditProfile
              v-if="canTransform"
              v-model:quality="quality"
              v-model:width-input="widthInput"
              v-model:height-input="heightInput"
              v-model:keep-aspect="keepAspect"
              v-model:mute-audio="muteAudio"
              v-model:fast-conversion="fastConversion"
              :is-video="originalAssetType === AssetType.Video"
              :quality-values="qualityValues"
              :available-size-presets="availableSizePresets"
              :show-reset-dimensions="showResetDimensions"
              :show-recommended-button="showRecommendedButton"
              :busy-action="busyAction"
              :apply-button-text="editApplyButtonText"
              :can-use-transformed="canUseTransformed"
              :show-result="currentTransformedAssetMatchesSettings"
              :previous-file="originalFileComparison"
              :current-file="transformedFileComparison"
              @apply-recommended-settings="applyRecommendedSettings"
              @reset-dimensions="resetDimensions"
              @apply-size-preset="applySizePreset"
              @sync-height-from-width="syncHeightFromWidth"
              @sync-width-from-height="syncWidthFromHeight"
              @apply-settings="applySettings"
              @finish="finishWithTransformed"
            />
            <UploadSettingsOtherProfile
              v-else
              :busy-action="busyAction"
              :apply-button-text="editApplyButtonText"
              :can-use-transformed="canUseTransformed"
              :show-result="currentTransformedAssetMatchesSettings"
              :previous-file="originalFileComparison"
              :current-file="transformedFileComparison"
              @apply-settings="applySettings"
              @finish="finishWithTransformed"
            />
          </UploadSettingsSection>
        </template>
      </div>
    </template>
  </AssetModal>
</template>
