<script lang="ts" setup>
import type {
  AssetVariantInfo,
  AssetWizardResult,
} from '#layers/thei/shared/api/asset';
import { AssetType, assetSourceName } from '#layers/thei/shared/asset';
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
type UseCandidate = 'source' | 'transformed' | 'selected' | null;
type ActiveProfile = 'source' | 'family' | 'create';
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
  loadVariants,
  uploadWithSettings,
  touchVariant,
} = useUploadSettingsAssets(props.modalData);

const errorMessage = ref('');
const selectedVariantUuid = ref('');
const processingSourceAssetUuid = ref('');
const currentUnprocessedAsset = shallowRef<AssetVariantInfo | null>(null);
const currentTransformedAsset = shallowRef<AssetVariantInfo | null>(null);
const currentTransformedSourceKey = ref('');
const activeUseCandidate = ref<UseCandidate>(null);
const activeProfile = ref<ActiveProfile>('source');
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
let sourceDimensionsAppliedAsDefault = false;

const sourceAsset = computed(() =>
  props.modalData.source.kind === 'asset' ? props.modalData.source.asset : null,
);
const processingSourceAsset = computed(() => {
  return (
    variants.value.find(
      (variant) => variant.assetUuid === processingSourceAssetUuid.value,
    ) ??
    sourceAsset.value ??
    null
  );
});
const sourceFile = computed(() => {
  const asset = processingSourceAsset.value;
  if (!asset && props.modalData.source.kind === 'file') {
    return props.modalData.source.file;
  }
  const storedAsset =
    asset ??
    (props.modalData.source.kind === 'asset'
      ? props.modalData.source.asset
      : null);
  if (!storedAsset) {
    if (props.modalData.source.kind === 'file') {
      return props.modalData.source.file;
    }
    throw new Error('Asset source is unavailable');
  }
  const storedName = assetSourceName(storedAsset.meta);
  return {
    name:
      (storedName && !isSyntheticAssetFilename(storedName)
        ? storedName
        : undefined) ??
      `${phrase.value.upload_variant_saved}.${storedAsset.extension}`,
    extension: storedAsset.extension,
    size: storedAsset.size,
    objectUrl:
      storedAsset.media?.src ?? storedAsset.assetUrl,
  };
});
const sourceSectionTitle = computed(() =>
  processingSourceAsset.value
    ? phrase.value.upload_section_source
    : phrase.value.upload_section_selected_file,
);

const sourceAssetType = computed(() => {
  if (processingSourceAsset.value) return processingSourceAsset.value.type;
  if (isExtensionAllowed(sourceFile.value.extension, imageExtensionProfile)) {
    return AssetType.Image;
  }
  if (isExtensionAllowed(sourceFile.value.extension, videoExtensionProfile)) {
    return AssetType.Video;
  }
  return AssetType.Other;
});

const profileConfig = computed(() =>
  getAssetUploadProfileConfig(props.modalData.uploadProfile),
);

const isSourceMedia = computed(
  () =>
    sourceAssetType.value === AssetType.Image ||
    sourceAssetType.value === AssetType.Video,
);
const canTransform = computed(() => isSourceMedia.value);
const canZipSourceFile = computed(
  () =>
    sourceAssetType.value === AssetType.Other &&
    canZipAssetExtension(sourceFile.value.extension),
);
const canEditFile = computed(
  () => canTransform.value || canZipSourceFile.value,
);

const pickedFile =
  props.modalData.source.kind === 'file' ? props.modalData.source.file : null;
const { dimensions: pickedFileDimensions } = useFileInfo(
  pickedFile?.objectUrl ?? '',
  pickedFile?.extension ?? '',
);
const sourceDimensions = computed(
  () =>
    (processingSourceAsset.value
      ? variantDimensions(processingSourceAsset.value)
      : pickedFileDimensions.value) ?? undefined,
);

const unprocessedVariant = computed(() =>
  variants.value.find((variant) => variant.isUnprocessed),
);
const reusableSourceAsset = computed(
  () =>
    processingSourceAsset.value ??
    currentUnprocessedAsset.value ??
    unprocessedVariant.value ??
    null,
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
        phrase.value.upload_variant_transformed(index + 1),
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
const sourceDimensionsForComparison = computed(() =>
  sourceDimensions.value
    ? normalizeDimensionsForCurrentType(sourceDimensions.value)
    : undefined,
);
const previewDimensions = computed(() =>
  calculatePreviewDimensions(sourceDimensions.value, parsedDimensions.value),
);
const availableSizePresets = computed(() =>
  getAvailableAssetSizePresets(sourceDimensions.value),
);
const showResetDimensions = computed(
  () =>
    Boolean(sourceDimensionsForComparison.value) &&
    !dimensionsEqual(
      parsedDimensions.value,
      sourceDimensionsForComparison.value,
    ),
);

const recommendedEditSettings = computed<EditableSettings | null>(() => {
  if (canZipSourceFile.value) {
    return createFileZipSettings();
  }

  if (!canTransform.value) return null;

  const configured = profileConfig.value;
  const dimensions = configured?.dimensions ?? sourceDimensions.value;

  if (!dimensions) return null;

  const isVideo = sourceAssetType.value === AssetType.Video;
  const settingsDimensions = isVideo ? evenDimensions(dimensions) : dimensions;
  const imageQuality = configured?.imageQuality ?? 90;
  const videoQuality = configured?.videoQuality ?? 85;
  const common = {
    resizeMode: configured?.resizeMode ?? 'inside',
    allowUpscale: configured?.allowUpscale ?? false,
  } as const;

  if (sourceAssetType.value === AssetType.Image) {
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
  if (canZipSourceFile.value) {
    return createFileZipSettings();
  }

  if (!canTransform.value) return null;

  if (sourceAssetType.value === AssetType.Image) {
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
    currentTransformedAsset.value?.settingsKey ===
      currentEditSettingsKey.value &&
    currentTransformedSourceKey.value === processingSourceKey(),
);
const canUseSource = computed(
  () =>
    activeUseCandidate.value === 'source' &&
    Boolean(reusableSourceAsset.value) &&
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
    : canZipSourceFile.value
      ? phrase.value.upload_compress_to_zip
      : phrase.value.upload_apply_settings,
);

const transformedAssetDimensions = computed(() =>
  currentTransformedAsset.value
    ? variantDimensions(currentTransformedAsset.value)
    : undefined,
);
const sourceFileComparison = computed(() => ({
  extension: sourceFile.value.extension,
  size: sourceFile.value.size,
  dimensions: sourceDimensions.value,
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
  if (canZipSourceFile.value) return 'zip';
  if (sourceAssetType.value === AssetType.Image) return 'webp';
  if (sourceAssetType.value === AssetType.Video) return 'webm';
  return sourceFile.value.extension;
});
const uploadedVariantItems = computed(() =>
  sortedVariants.value.map((variant) => ({
    assetUuid: variant.assetUuid,
    title: variantTitle(variant),
    description: variantSettingsSummary(variant),
    extension: variant.extension,
    size: variant.size,
    dimensions: variantDimensions(variant),
    type: variant.type,
    hasAudio: variantHasAudio(variant),
    usageCount: variant.usageCount,
    isCurrent: variant.assetUuid === sourceAsset.value?.assetUuid,
  })),
);
const processingSourceLabel = computed(() =>
  processingSourceAsset.value
    ? variantTitle(processingSourceAsset.value)
    : sourceFile.value.name,
);

const sourcePreviewSource = computed<PreviewSource>(() => ({
  key: `source:${sourceFile.value.objectUrl}:native`,
  extension: sourceFile.value.extension,
  src: sourceFile.value.objectUrl,
  href: sourceFile.value.objectUrl,
  isMedia: isSourceMedia.value,
  hasAudio: sourceAssetType.value === AssetType.Video ? undefined : false,
  displayDimensions: sourceDimensions.value,
}));
const modifiedPreviewSource = computed<PreviewSource | null>(() => {
  if (activeProfile.value !== 'create') return null;

  if (
    currentTransformedAssetMatchesSettings.value &&
    currentTransformedAsset.value
  ) {
    return variantPreviewSource(currentTransformedAsset.value);
  }

  if (!isSourceMedia.value || !showResetDimensions.value) return null;

  const display = previewDimensions.value;
  const displayKey = display ? `${display.width}x${display.height}` : 'native';
  return {
    key: `edit-preview:${sourceFile.value.objectUrl}:${displayKey}`,
    extension: sourceFile.value.extension,
    src: sourceFile.value.objectUrl,
    href: sourceFile.value.objectUrl,
    isMedia: true,
    hasAudio: sourceAssetType.value === AssetType.Video ? undefined : false,
    displayDimensions: display,
  };
});
const comparePreview = computed(() => {
  const modified = modifiedPreviewSource.value;
  if (!sourcePreviewSource.value.isMedia || !modified?.isMedia) return null;

  return {
    key: `${sourcePreviewSource.value.key}|${modified.key}`,
    original: sourcePreviewSource.value,
    modified,
  };
});
const disableSeamlessCompare = computed(
  () =>
    activeProfile.value === 'create' &&
    showResetDimensions.value &&
    !currentTransformedAssetMatchesSettings.value,
);
const singlePreview = computed(() =>
  activeProfile.value === 'source' && reusableSourceAsset.value
    ? variantPreviewSource(reusableSourceAsset.value)
    : activeProfile.value === 'family' && selectedVariant.value
      ? variantPreviewSource(selectedVariant.value)
      : (modifiedPreviewSource.value ?? sourcePreviewSource.value),
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
  sourceDimensionsForComparison,
  (dimensions) => {
    if (
      !dimensions ||
      profileConfig.value ||
      sourceDimensionsAppliedAsDefault
    ) {
      return;
    }
    sourceDimensionsAppliedAsDefault = true;
    setDimensionInputs(dimensions);
  },
  { immediate: true },
);
watch(
  () => processingSourceAsset.value?.assetUuid,
  () => {
    sourceDimensionsAppliedAsDefault = false;
    currentTransformedAsset.value = null;
    currentTransformedSourceKey.value = '';
    const dimensions = sourceDimensionsForComparison.value;
    if (dimensions) setDimensionInputs(dimensions);
  },
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
    const preferredVariant = sourceAsset.value
      ? loadedVariants.find(
          (variant) => variant.assetUuid === sourceAsset.value?.assetUuid,
        )
      : [...loadedVariants].sort((a, b) => a.size - b.size)[0];
    if (preferredVariant && !profileSelectedByUser.value) {
      selectedVariantUuid.value = preferredVariant.assetUuid;
      processingSourceAssetUuid.value = preferredVariant.assetUuid;
      activeUseCandidate.value = 'selected';
      activeProfile.value = 'family';
    }
  } catch (error) {
    errorMessage.value = errorToMessage(
      error,
      phrase.value.upload_error_load_variants,
    );
  }
});

async function saveWithoutProcessing() {
  const settings = createOriginalAssetSettings();
  errorMessage.value = '';

  const reusableAsset = reusableSourceAsset.value;
  if (reusableAsset) {
    currentUnprocessedAsset.value = reusableAsset;
    selectedVariantUuid.value = '';
    activeUseCandidate.value = 'source';
    profileSelectedByUser.value = true;
    activeProfile.value = 'source';
    return;
  }

  busyAction.value = 'save-unchanged';
  try {
    const response = await uploadWithSettings(settings);
    currentUnprocessedAsset.value = response;
    selectedVariantUuid.value = '';
    activeUseCandidate.value = 'source';
    profileSelectedByUser.value = true;
    activeProfile.value = 'source';
  } catch (error) {
    errorMessage.value = errorToMessage(
      error,
      phrase.value.upload_error_unchanged,
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
  const sourceKey = processingSourceKey();
  const cachedAsset =
    currentTransformedAsset.value?.settingsKey === currentSettingsKey &&
    currentTransformedSourceKey.value === sourceKey
      ? currentTransformedAsset.value
      : undefined;

  errorMessage.value = '';

  try {
    if (cachedAsset) {
      currentTransformedAsset.value = cachedAsset;
      selectedVariantUuid.value = '';
      activeUseCandidate.value = 'transformed';
      profileSelectedByUser.value = true;
      activeProfile.value = 'create';
      return;
    }

    busyAction.value = 'apply';
    const response = await uploadWithSettings(
      settings,
      processingSourceAsset.value?.assetUuid,
    );
    currentTransformedAsset.value = response;
    currentTransformedSourceKey.value = sourceKey;
    selectedVariantUuid.value = '';
    activeUseCandidate.value = 'transformed';
    profileSelectedByUser.value = true;
    activeProfile.value = 'create';
  } catch (error) {
    errorMessage.value = errorToMessage(error, phrase.value.upload_error_apply);
  } finally {
    busyAction.value = undefined;
    uploadStatus.value = null;
  }
}

function selectVariant(variant: AssetVariantInfo) {
  selectedVariantUuid.value = variant.assetUuid;
  processingSourceAssetUuid.value = variant.assetUuid;
  activeUseCandidate.value = 'selected';
  profileSelectedByUser.value = true;
  activeProfile.value = 'family';
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

async function finishWithSource() {
  if (canUseSource.value && reusableSourceAsset.value) {
    await finishWithAsset(reusableSourceAsset.value);
  }
}

async function finishWithAsset(asset: AssetVariantInfo) {
  await touchVariant(asset.assetUuid);
  emit('modalResult', {
    type: 'asset-ready',
    asset,
  });
}

function setActiveProfile(profile: ActiveProfile) {
  profileSelectedByUser.value = true;
  activeProfile.value = profile;
  if (profile === 'source') {
    if (reusableSourceAsset.value) {
      currentUnprocessedAsset.value = reusableSourceAsset.value;
      selectedVariantUuid.value = '';
      activeUseCandidate.value = 'source';
    }
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
  const dimensions = sourceDimensions.value;
  if (!dimensions) return;
  setDimensionInputs(resizeDimensionsByLongSide(dimensions, size));
}

function resetDimensions() {
  if (!sourceDimensions.value) return;
  setDimensionInputs(normalizeDimensionsForCurrentType(sourceDimensions.value));
}

function syncHeightFromWidth() {
  if (!keepAspect.value || !sourceDimensions.value) return;
  const width = parseAssetDimensionInput(widthInput.value);
  if (!width) return;
  const height = Math.max(
    1,
    Math.round(
      (width * sourceDimensions.value.height) / sourceDimensions.value.width,
    ),
  );
  setDimensionInputs({ width, height });
}

function syncWidthFromHeight() {
  if (!keepAspect.value || !sourceDimensions.value) return;
  const height = parseAssetDimensionInput(heightInput.value);
  if (!height) return;
  const width = Math.max(
    1,
    Math.round(
      (height * sourceDimensions.value.width) / sourceDimensions.value.height,
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
  if (sourceAssetType.value !== AssetType.Video) return dimensions;
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
    src: variant.media?.src ?? variant.assetUrl,
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
  if (variant.isUnprocessed) {
    return phrase.value.upload_variant_unchanged;
  }
  if (variant.settings?.type === 'file-zip') {
    return phrase.value.upload_variant_archive;
  }
  if (isEditableSettings(variant.settings)) {
    return (
      modifiedVariantNames.value.get(variant.assetUuid) ??
      phrase.value.upload_variant_transformed(1)
    );
  }
  return phrase.value.upload_variant_saved;
}

function variantSettingsSummary(variant: AssetVariantInfo): string {
  const settings = variant.settings;
  if (!settings || settings.type === 'original') {
    return phrase.value.upload_variant_details_unchanged;
  }
  if (settings.type === 'file-zip') {
    return phrase.value.upload_variant_details_zip;
  }

  const parts = [
    phrase.value.upload_variant_quality(settings.quality),
    settings.resizeMode === 'cover'
      ? phrase.value.upload_variant_resize_cover
      : phrase.value.upload_variant_resize_inside,
    settings.allowUpscale
      ? phrase.value.upload_variant_upscale
      : phrase.value.upload_variant_no_upscale,
  ];
  if (settings.type === 'video-transform') {
    parts.push(
      settings.stripAudio
        ? phrase.value.upload_variant_audio_removed
        : phrase.value.upload_variant_audio_kept,
    );
    if (settings.fastConversion) {
      parts.push(phrase.value.upload_variant_fast);
    }
  }
  return parts.join(' · ');
}

function processingSourceKey() {
  return processingSourceAsset.value?.assetUuid
    ? `asset:${processingSourceAsset.value.assetUuid}`
    : props.modalData.source.kind === 'file'
      ? `file:${props.modalData.source.familyUuid}`
      : '';
}

function isSyntheticAssetFilename(filename: string) {
  return /^a-[0-9a-f-]{36}\.[^.]+$/i.test(filename);
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
  <AssetModal
    :aside-title="phrase.upload_variants"
  >
    <template #preview>
      <AssetModalCompareMedia
        v-if="comparePreview"
        :key="`compare:${comparePreview.key}`"
        :original="comparePreview.original"
        :modified="comparePreview.modified"
        :original-label="phrase.upload_compare_source"
        :modified-label="phrase.upload_compare_result"
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
            :data-title-popup="
              processingSourceAsset
                ? phrase.upload_replace_with_new_file_hint
                : undefined
            "
            @click="emit('modalResult', { type: 'upload-new' })"
          >
            <Icon name="file" class="mr-xs" />
            <span>
              {{
                processingSourceAsset
                  ? phrase.upload_replace_with_new_file
                  : phrase.pick_another_file
              }}
            </span>
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
          :active="activeProfile === 'source'"
          :title="sourceSectionTitle"
          @activate="setActiveProfile('source')"
        >
          <div
            v-if="processingSourceAsset"
            class="text-sm leading-snug text-text-3"
          >
            {{ phrase.upload_source_hint }}
          </div>
          <AssetModalFileInfo
            :name="sourceFile.name"
            :extension="sourceFile.extension"
            :size="sourceFile.size"
            :dimensions="sourceDimensions"
          />

          <Button
            v-if="!processingSourceAsset && !reusableSourceAsset"
            variant="secondary"
            :disabled="Boolean(busyAction)"
            @click="saveWithoutProcessing"
          >
            <Icon
              :name="buttonIcon('save-unchanged', 'cloud-upload')"
              class="mr-xs"
            />
            <span>
              {{
                busyAction === 'save-unchanged'
                  ? busyText(
                      phrase.upload_saving_unchanged,
                      phrase.upload_saving,
                    )
                  : phrase.upload_save_unchanged
              }}
            </span>
          </Button>
          <Button
            variant="primary"
            :disabled="!canUseSource"
            class="font-semibold"
            @click="finishWithSource"
          >
            <span>{{ phrase.upload_use_variant }}</span>
            <Icon name="chevron-right" class="ml-xs" />
          </Button>
        </UploadSettingsSection>

        <UploadSettingsDivider v-if="hasUploadedVariants" />

        <UploadSettingsSection
          v-if="hasUploadedVariants"
          :active="activeProfile === 'family'"
          :title="phrase.upload_section_family"
          @activate="setActiveProfile('family')"
        >
          <template #header-extra>
            <Icon
              v-if="busyAction === 'variants'"
              name="loading"
              class="text-text-2"
            />
          </template>

          <template v-if="uploadedVariantItems.length">
            <UploadSettingsVariantList
              :items="uploadedVariantItems"
              :selected-uuid="selectedVariantUuid"
              @select="selectVariantByUuid"
            />
            <div class="text-sm leading-snug text-text-3">
              {{ phrase.upload_family_hint }}
            </div>
          </template>
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
            <span>{{ phrase.upload_use_variant }}</span>
            <Icon name="chevron-right" class="ml-xs" />
          </Button>
        </UploadSettingsSection>

        <template v-if="canEditFile">
          <UploadSettingsDivider />

          <UploadSettingsSection
            :active="activeProfile === 'create'"
            :title="
              canZipSourceFile
                ? phrase.upload_section_zip
                : phrase.upload_section_create
            "
            @activate="setActiveProfile('create')"
          >
            <div class="text-sm leading-snug text-text-3">
              {{ phrase.upload_create_from(processingSourceLabel) }}
            </div>
            <UploadSettingsEditProfile
              v-if="canTransform"
              v-model:quality="quality"
              v-model:width-input="widthInput"
              v-model:height-input="heightInput"
              v-model:keep-aspect="keepAspect"
              v-model:mute-audio="muteAudio"
              v-model:fast-conversion="fastConversion"
              :is-video="sourceAssetType === AssetType.Video"
              :quality-values="qualityValues"
              :available-size-presets="availableSizePresets"
              :show-reset-dimensions="showResetDimensions"
              :show-recommended-button="showRecommendedButton"
              :busy-action="busyAction"
              :apply-button-text="editApplyButtonText"
              :can-use-transformed="canUseTransformed"
              :show-result="currentTransformedAssetMatchesSettings"
              :previous-file="sourceFileComparison"
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
              :previous-file="sourceFileComparison"
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
