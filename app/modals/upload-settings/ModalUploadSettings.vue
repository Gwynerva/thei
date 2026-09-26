<script lang="ts" setup>
import type {
  AssetVariantInfo,
  AssetWizardResult,
} from '#layers/thei/shared/api/asset';
import {
  AssetType,
  assetMetaDimensions,
  type VideoAssetMeta,
} from '#layers/thei/shared/asset';
import { assetSelectionError } from '#layers/thei/shared/asset-library';
import { AUTO_IMAGE_FORMATS } from '#layers/thei/shared/asset-image-format-auto';
import {
  ASSET_QUALITY_LEVEL_QUALITY,
  ASSET_QUALITY_LEVELS,
  type AssetQualityLevel,
  type AssetQualityStop,
} from '#layers/thei/shared/asset-quality-levels';
import { describeAssetRecipe } from '#layers/thei/shared/asset-recipe';
import {
  estimateImageSize,
  estimateVideoSize,
  type ImageSizeFallback,
} from '#layers/thei/shared/asset-size-estimate';
import {
  getAssetUploadProfileAspect,
  getAssetUploadProfileConfig,
} from '#layers/thei/shared/asset-upload-profiles';
import {
  assetImageFormatExtension,
  createFileZipSettings,
  createOriginalAssetSettings,
  isAssetTransformSettings,
  type AssetImageFormat,
  type AssetUploadRequest,
} from '#layers/thei/shared/asset-upload-settings';
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
import AssetModalPreviewMedia from '../asset-modal/AssetModalPreviewMedia.vue';
import FilePreview from '../../components/FilePreview.vue';
import { useFileInfo } from '../asset-modal/use-file-info';
import { detectVideoAudio } from '../asset-modal/video-audio';
import AssetCropBox from './AssetCropBox.vue';
import UploadSettingsCreate from './UploadSettingsCreate.vue';
import UploadSettingsDivider from './UploadSettingsDivider.vue';
import UploadSettingsResultPanel from './UploadSettingsResultPanel.vue';
import UploadSettingsSection from './UploadSettingsSection.vue';
import UploadSettingsVariantList from './UploadSettingsVariantList.vue';
import {
  autoImageFormatDetail,
  imageFormatLabel,
  qualityStopLabels,
} from './format-labels';
import {
  buildQualityStops,
  LOSSY_IMAGE_FORMATS,
  stopRenderOrder,
  type StopSize,
} from './quality-stops';
import type { DiscreteBarStop } from '../../components/field/discrete-bar-stops';
import type { UploadSettingsFormatOption } from './UploadSettingsFormatList.vue';
import {
  errorMessage,
  useDraftRenders,
  type DraftRenderRequest,
} from './use-draft-renders';
import {
  draftOriginKey,
  useDraftSession,
  type DraftOrigin,
} from './use-draft-session';
import { useEditSettings } from './use-edit-settings';
import {
  useUploadSettingsAssets,
  type UploadSettingsModalData,
} from './use-upload-settings-assets';

type UploadSettingsResult =
  { type: 'upload-new' } | { type: 'asset-missing' } | AssetWizardResult;
type Section = 'source' | 'family' | 'create';

const emit = defineEmits<{
  modalResult: [result: UploadSettingsResult];
}>();

const props = defineProps<{
  modalData: UploadSettingsModalData;
}>();

const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');

const pickedFile =
  props.modalData.source.kind === 'file' ? props.modalData.source.file : null;
const sourceAsset =
  props.modalData.source.kind === 'asset' ? props.modalData.source.asset : null;
const profile = getAssetUploadProfileConfig(props.modalData.uploadProfile);

const { variants, loadingVariants, status, loadVariants, commit, touch } =
  useUploadSettingsAssets(props.modalData);

const errorText = ref('');
const busy = ref<'commit' | 'finish' | null>(null);
const selectedUuid = ref(sourceAsset?.assetUuid ?? '');
/** The stored variant new settings apply to; empty for the picked file. */
const processingUuid = ref(sourceAsset?.assetUuid ?? '');
const previewMode = ref<'edit' | 'compare'>('edit');
/** The crop frame is out for editing; a place with fixed proportions keeps it out. */
const cropping = ref(false);

// ---------------------------------------------------------------------------
// The file new settings are applied to.

const processingVariant = computed<AssetVariantInfo | undefined>(
  () =>
    variants.value.find(
      (variant) => variant.assetUuid === processingUuid.value,
    ) ??
    (sourceAsset?.assetUuid === processingUuid.value ? sourceAsset : undefined),
);
const origin = computed<DraftOrigin | undefined>(() =>
  processingVariant.value
    ? { kind: 'asset', assetUuid: processingVariant.value.assetUuid }
    : pickedFile
      ? { kind: 'file', file: pickedFile }
      : undefined,
);
const originKey = computed(() =>
  origin.value ? draftOriginKey(origin.value) : '',
);
const draftSession = useDraftSession(props.modalData, () => origin.value);

const processingExtension = computed(
  () => processingVariant.value?.extension ?? pickedFile?.extension ?? '',
);
const processingType = computed<AssetType>(() => {
  if (processingVariant.value) return processingVariant.value.type;
  if (isExtensionAllowed(processingExtension.value, imageExtensionProfile))
    return AssetType.Image;
  if (isExtensionAllowed(processingExtension.value, videoExtensionProfile))
    return AssetType.Video;
  return AssetType.Other;
});
const transformKind = computed<'image' | 'video' | undefined>(() =>
  processingType.value === AssetType.Image
    ? 'image'
    : processingType.value === AssetType.Video
      ? 'video'
      : undefined,
);
const canZip = computed(
  () =>
    processingType.value === AssetType.Other &&
    canZipAssetExtension(processingExtension.value),
);
const canCreate = computed(() => Boolean(transformKind.value) || canZip.value);
const isVector = computed(
  () => processingExtension.value.toLowerCase() === 'svg',
);

/** Displayed address of the processing source, without the base path. */
const processingSrc = computed(
  () =>
    processingVariant.value?.media?.src ??
    processingVariant.value?.assetUrl ??
    pickedFile?.objectUrl ??
    '',
);

/**
 * The still a video is shown with before it plays: the stored preview of a
 * library video, or, for a video picked but not uploaded, the frame the
 * browser finds best — the same points the server will weigh.
 */
const pickedPoster = useVideoPoster(() =>
  !processingVariant.value &&
  pickedFile &&
  isExtensionAllowed(pickedFile.extension, videoExtensionProfile)
    ? pickedFile.objectUrl
    : undefined,
);
const processingPoster = computed(() =>
  processingVariant.value
    ? videoPosterOf(processingVariant.value.media)
    : pickedPoster.value,
);

const { dimensions: pickedDimensions, duration: pickedDuration } = useFileInfo(
  pickedFile?.objectUrl ?? '',
  pickedFile?.extension ?? '',
);
const humanSize = useHumanSize();
const pickedHasAudio = ref<boolean | undefined>();
if (
  pickedFile &&
  isExtensionAllowed(pickedFile.extension, videoExtensionProfile)
) {
  onMounted(async () => {
    pickedHasAudio.value = await detectVideoAudio(
      pickedFile.file,
      pickedFile.extension,
    );
  });
}

/**
 * Size, audio and, for a video, length and rate of the processing source.
 * The server's probe wins once the draft is open; until then the browser's
 * own reading of the file stands in, with the file's bytes over its length
 * as a rough bitrate.
 */
const transformSource = computed(() => {
  const draft = draftSession.draft.value;
  const variant = processingVariant.value;
  const dimensions =
    draft?.width && draft.height
      ? { width: draft.width, height: draft.height }
      : variant
        ? assetMetaDimensions(variant.meta)
        : pickedDimensions.value;
  if (!dimensions?.width || !dimensions.height) return undefined;
  const videoMeta =
    variant?.type === AssetType.Video
      ? (variant.meta as VideoAssetMeta | null)
      : null;
  const hasAudio =
    draft?.hasAudio ?? (variant ? videoMeta?.hasAudio : pickedHasAudio.value);
  const duration =
    draft?.duration ?? videoMeta?.duration ?? pickedDuration.value;
  const fps = draft?.fps ?? videoMeta?.fps;
  const bitrate =
    draft?.bitrate ??
    videoMeta?.bitrate ??
    (pickedFile && pickedDuration.value
      ? (pickedFile.size * 8) / pickedDuration.value
      : undefined);
  return {
    width: dimensions.width,
    height: dimensions.height,
    isVector: isVector.value,
    ...(hasAudio !== undefined ? { hasAudio } : {}),
    ...(duration ? { duration } : {}),
    ...(fps ? { fps } : {}),
    ...(bitrate ? { bitrate } : {}),
    ...(draft?.codec ? { codec: draft.codec } : {}),
  };
});
const sourceDimensions = computed(() =>
  transformSource.value
    ? {
        width: transformSource.value.width,
        height: transformSource.value.height,
      }
    : undefined,
);

const sourceFileInfo = computed(() => ({
  extension: processingExtension.value,
  size: processingVariant.value?.size ?? pickedFile?.size,
  dimensions: sourceDimensions.value,
  duration: transformSource.value?.duration,
}));

const processingIsCompressed = computed(() =>
  isAssetTransformSettings(processingVariant.value?.settings),
);

// ---------------------------------------------------------------------------
// Settings for a new variant, and what they produce.

const section = ref<Section>(initialSection());

// "Auto" picks by the sizes the renders below measure, and the renders are
// asked for by these settings: the sizes reach the settings through a
// function, read only once both exist.
const edit = useEditSettings({
  kind: () => transformKind.value,
  source: () => transformSource.value,
  profile: () => profile,
  formatSizes: () => formatSizes(),
});

const rendersActive = computed(
  () => section.value === 'create' && transformKind.value === 'image',
);
/** The image formats the current settings are rendered in. */
const renderedFormats = computed<AssetImageFormat[]>(() => {
  if (!rendersActive.value) return [];
  const fixed = edit.fixedFormat.value;
  if (fixed) return [fixed];
  const chosen = edit.formatChoice.value;
  // The chosen format first: the server starts on it before the rest.
  return [...edit.availableFormats.value].sort(
    (left, right) => Number(right === chosen) - Number(left === chosen),
  );
});
/** A dry run's place in the cache: the source it is of, and its settings. */
function renderRequest(
  at: ReturnType<typeof edit.settingsAt>,
): DraftRenderRequest[] {
  return at && at.request.type === 'image-transform'
    ? [{ key: `${originKey.value}|${at.key}`, request: at.request }]
    : [];
}
/**
 * The current settings in every format, so each shows its real size, and
 * then every other quality stop in the format it would be stored in, so the
 * bar shows real sizes too — nearest stops first.
 */
const renderRequests = computed<DraftRenderRequest[]>(() => {
  if (!rendersActive.value) return [];
  const atChosen = renderedFormats.value.flatMap((format) =>
    renderRequest(edit.settingsAt({ format })),
  );
  const atOthers = stopRenderOrder(
    edit.qualityLevel.value,
    edit.fixedFormat.value ?? edit.formatChoice.value,
  ).flatMap(({ level, format }) =>
    renderRequest(
      edit.settingsAt({ format, quality: ASSET_QUALITY_LEVEL_QUALITY[level] }),
    ),
  );
  return [...atChosen, ...atOthers];
});
const primaryRenderKey = computed(() =>
  rendersActive.value && edit.request.value?.type === 'image-transform'
    ? `${originKey.value}|${edit.settingsKey.value}`
    : '',
);
const renders = useDraftRenders({
  withDraft: draftSession.withDraft,
  requests: () => renderRequests.value,
  primaryKey: () => primaryRenderKey.value,
});

function formatKey(format: AssetImageFormat) {
  const at = edit.settingsAt({ format });
  return at ? `${originKey.value}|${at.key}` : '';
}

function stopKey(level: AssetQualityLevel, format: AssetImageFormat) {
  const at = edit.settingsAt({
    format,
    quality: ASSET_QUALITY_LEVEL_QUALITY[level],
  });
  return at ? `${originKey.value}|${at.key}` : '';
}

function formatSizes(): Partial<Record<AssetImageFormat, number>> {
  return Object.fromEntries(
    renderedFormats.value.flatMap((format) => {
      const size = renders.renderFor(formatKey(format))?.size;
      return size === undefined ? [] : [[format, size]];
    }),
  );
}

/** "Auto" is still waiting for the sizes it picks by. */
const autoPending = computed(
  () =>
    rendersActive.value &&
    !edit.fixedFormat.value &&
    edit.formatChoice.value === 'auto' &&
    !edit.autoFormat.value?.reason &&
    AUTO_IMAGE_FORMATS.some((format) => renders.isPending(formatKey(format))),
);
const renderPending = computed(
  () => renders.pending.value || autoPending.value,
);

/**
 * The last image render shown, kept on screen while a newer one is made so
 * the comparison does not jump away at every change.
 */
const shownRender = shallowRef(renders.current.value);
watch(
  () => renders.current.value,
  (render) => {
    if (render) shownRender.value = render;
  },
);

/** A video or archive created in this session, and what it was made from. */
const created = shallowRef<{ key: string; asset: AssetVariantInfo } | null>(
  null,
);
const createKey = computed(() =>
  canZip.value
    ? `${originKey.value}|file-zip`
    : `${originKey.value}|${edit.settingsKey.value}`,
);
const currentCreated = computed(() =>
  created.value?.key === createKey.value ? created.value.asset : undefined,
);

const result = computed(() => {
  if (transformKind.value === 'image') {
    const render = renderPending.value ? undefined : renders.current.value;
    return render
      ? {
          extension: render.extension,
          size: render.size,
          dimensions: { width: render.width, height: render.height },
          src: render.url,
        }
      : undefined;
  }
  const asset = currentCreated.value;
  return asset
    ? {
        extension: asset.extension,
        size: asset.size,
        dimensions: assetMetaDimensions(asset.meta),
        src: asset.media?.src ?? asset.assetUrl,
      }
    : undefined;
});
/**
 * What the settings will produce, shown until the real result is known: the
 * kind of file, its size as far as it can be told, and its dimensions.
 */
const expectedResult = computed(() => {
  if (canZip.value) return { extension: 'zip' };
  const resolved = edit.resolved.value;
  if (!resolved) return undefined;
  const size =
    resolved.type === 'video-transform'
      ? videoStopSize(resolved)
      : imageStopSize(edit.qualityLevel.value);
  return {
    extension:
      resolved.type === 'image-transform'
        ? assetImageFormatExtension(resolved.format)
        : 'webm',
    dimensions: resolved.dimensions,
    ...(size ? { size: size.bytes, approximate: size.approximate } : {}),
  };
});

// ---------------------------------------------------------------------------
// What each quality stop comes out at.

/** A PNG or GIF source: its size says nothing about a lossy output's. */
const sourceLossless = computed(() =>
  ['png', 'gif'].includes(processingExtension.value.toLowerCase()),
);
/** What an image estimate falls back on before anything is rendered. */
const imageFallback = computed<ImageSizeFallback | undefined>(() => {
  const source = transformSource.value;
  const output = edit.resolved.value?.dimensions;
  const bytes = sourceFileInfo.value.size;
  if (!source || !output || !bytes) return undefined;
  return {
    sourceBytes: bytes,
    sourcePixels: source.width * source.height,
    outputPixels: output.width * output.height,
    sourceLossless: sourceLossless.value,
  };
});

/** The sizes already rendered in a format, by stop. */
function measuredIn(
  format: AssetImageFormat,
): Partial<Record<AssetQualityStop, number>> {
  if (format === 'webp-lossless') {
    const size = renders.renderFor(formatKey(format))?.size;
    return size === undefined ? {} : { lossless: size };
  }
  return Object.fromEntries(
    ASSET_QUALITY_LEVELS.flatMap((level) => {
      const size = renders.renderFor(stopKey(level, format))?.size;
      return size === undefined ? [] : [[level, size]];
    }),
  );
}

function formatStopSize(
  format: AssetImageFormat,
  stop: AssetQualityStop,
): StopSize | undefined {
  return estimateImageSize(
    format,
    format === 'webp-lossless' ? 'lossless' : stop,
    measuredIn(format),
    imageFallback.value,
  );
}

/** What an image comes out at on a stop, in the format it would be stored in. */
function imageStopSize(stop: AssetQualityStop): StopSize | undefined {
  if (stop === 'lossless') return formatStopSize('webp-lossless', stop);
  const fixed = edit.fixedFormat.value;
  if (fixed) return formatStopSize(fixed, stop);
  const choice = edit.formatChoice.value;
  if (choice !== 'auto') return formatStopSize(choice, stop);
  // "Auto" takes the smallest. A lossless guess is too rough to compete, so
  // lossless only enters once it has been rendered.
  const candidates = LOSSY_IMAGE_FORMATS.flatMap((format) => {
    const size = formatStopSize(format, stop);
    return size ? [size] : [];
  });
  const lossless = formatStopSize('webp-lossless', 'lossless');
  if (lossless && !lossless.approximate) candidates.push(lossless);
  if (!candidates.length) return undefined;
  return candidates.reduce((best, size) =>
    size.bytes < best.bytes ? size : best,
  );
}

/** What a video comes out at with these settings: an estimate, always. */
function videoStopSize(
  settings: NonNullable<ReturnType<typeof edit.settingsAt>>['settings'],
): StopSize | undefined {
  const source = transformSource.value;
  if (!source || settings.type !== 'video-transform') return undefined;
  const estimate = estimateVideoSize(settings, source);
  return estimate ? { bytes: estimate.bytes, approximate: true } : undefined;
}

/** What the file comes out at on a stop, whatever kind it is. */
function stopSize(stop: AssetQualityStop): StopSize | undefined {
  if (transformKind.value === 'image') return imageStopSize(stop);
  if (stop === 'lossless') return undefined;
  const at = edit.settingsAt({ quality: ASSET_QUALITY_LEVEL_QUALITY[stop] });
  return at ? videoStopSize(at.settings) : undefined;
}

/** The bar's stops, each with the size it comes out at. */
const qualityStops = computed<DiscreteBarStop[]>(() => {
  const kind = transformKind.value;
  if (!kind || section.value !== 'create') return [];
  return buildQualityStops({
    allowLossless: kind === 'image' && edit.canBeLossless.value,
    labels: qualityStopLabels(),
    sizeOf: stopSize,
    pendingOf: () => rendersActive.value,
    sourceSize: sourceFileInfo.value.size,
    units: language.value.sizeUnits,
    humanSize,
  });
});
/** The chosen stop's exact size, next to its name over the bar. */
const qualityDetail = computed(() => {
  if (!qualityStops.value.length) return undefined;
  const size = stopSize(edit.qualityLevel.value);
  return size
    ? `${size.approximate ? '≈ ' : ''}${humanSize(size.bytes)}`
    : undefined;
});

/** Why the frame keeps its proportions, when the place fixes them. */
const lockedTitle = computed(() => {
  const uploadProfile = props.modalData.uploadProfile;
  if (!profile?.aspect || !uploadProfile) return undefined;
  return phrase.value.upload_crop_locked(
    getAssetUploadProfileAspect(uploadProfile)?.ratio ?? '1:1',
  );
});

/**
 * Each format with the size the current settings come out at in it.
 *
 * Lossless is not a format to pick here but the bar's last stop; while it is
 * chosen, "Auto" and WebP mean the lossless WebP, and AVIF, which has no
 * lossless mode, is greyed out.
 */
const formatOptions = computed<UploadSettingsFormatOption[]>(() => {
  if (transformKind.value !== 'image' || edit.fixedFormat.value) return [];
  const sized = (format: AssetImageFormat) => {
    const key = formatKey(format);
    const render = renders.renderFor(key);
    const pending = renders.isPending(key);
    return {
      size: render?.size,
      pending,
      failed: Boolean(key) && !render && !pending,
    };
  };
  const lossless = edit.lossless.value && edit.canBeLossless.value;
  const auto = edit.autoFormat.value;
  // A vector source is best kept a vector, so that choice comes first.
  const formats = edit.availableFormats.value
    .filter((format) => format !== 'webp-lossless')
    .sort((left, right) => Number(right === 'svg') - Number(left === 'svg'));
  return [
    {
      value: 'auto',
      label: phrase.value.upload_format_auto,
      ...(lossless
        ? {
            detail: imageFormatLabel('webp-lossless'),
            ...sized('webp-lossless'),
          }
        : auto
          ? {
              detail: autoImageFormatDetail(auto),
              ...sized(auto.format),
              ...(autoPending.value ? { pending: true } : {}),
            }
          : {}),
    },
    ...formats.map((format) =>
      lossless && format === 'avif'
        ? {
            value: format,
            label: imageFormatLabel(format),
            disabled: true,
            hint: phrase.value.upload_format_avif_no_lossless,
          }
        : {
            value: format,
            label: imageFormatLabel(format),
            ...sized(lossless && format === 'webp' ? 'webp-lossless' : format),
          },
    ),
  ];
});
/** A vector kept a vector has no quality to choose. */
const vectorKept = computed(
  () =>
    edit.resolved.value?.type === 'image-transform' &&
    edit.resolved.value.format === 'svg',
);

// ---------------------------------------------------------------------------
// Stored variants.

const sortedVariants = computed(() =>
  [...variants.value].sort((a, b) => a.size - b.size),
);
const selectedVariant = computed(() =>
  variants.value.find((variant) => variant.assetUuid === selectedUuid.value),
);
const variantItems = computed(() =>
  sortedVariants.value.map((variant) => ({
    assetUuid: variant.assetUuid,
    extension: variant.extension,
    size: variant.size,
    dimensions: assetMetaDimensions(variant.meta),
    type: variant.type,
    hasAudio:
      variant.type === AssetType.Video ? variant.meta?.hasAudio : undefined,
    usageCount: variant.usageCount,
    isCurrent: variant.assetUuid === sourceAsset?.assetUuid,
    recipe: describeAssetRecipe(variant.settings, variant.meta, phrase.value),
  })),
);
const processingOptions = computed(() =>
  Object.fromEntries(
    sortedVariants.value
      .filter((variant) => variant.type === sourceAsset?.type)
      .map((variant) => {
        const size = assetMetaDimensions(variant.meta);
        return [
          variant.assetUuid,
          [
            variant.extension.toUpperCase(),
            size ? `${size.width}×${size.height}` : undefined,
            variant.isUnprocessed
              ? phrase.value.upload_variant_unchanged
              : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
        ];
      }),
  ),
);
const showFamily = computed(
  () => Boolean(sourceAsset) || variants.value.length > 0,
);

onMounted(async () => {
  try {
    const loaded = await loadVariants();
    if (sourceAsset) processingUuid.value = pickProcessingSource(loaded);
  } catch (error) {
    if (!handleAssetMissing(error))
      errorText.value = errorMessage(
        error,
        phrase.value.upload_error_load_variants,
      );
  }
});

watch(originKey, () => {
  renders.reset();
  shownRender.value = undefined;
  previewMode.value = 'edit';
});
watch(section, () => {
  errorText.value = '';
});

// ---------------------------------------------------------------------------
// Actions.

const selectionError = computed(() => {
  const asset =
    section.value === 'family' ? selectedVariant.value : currentCreated.value;
  return asset ? assetSelectionError(asset, props.modalData) : undefined;
});

const canUseRender = computed(
  () =>
    !busy.value &&
    transformKind.value === 'image' &&
    Boolean(renders.current.value) &&
    !renderPending.value,
);
const canUseCreated = computed(
  () => !busy.value && Boolean(currentCreated.value) && !selectionError.value,
);
const canUseSelected = computed(
  () => !busy.value && Boolean(selectedVariant.value) && !selectionError.value,
);

const busyLabel = computed(() => {
  if (draftSession.stagingProgress.value !== null) {
    return phrase.value.upload_staging(
      Math.round(draftSession.stagingProgress.value * 100),
    );
  }
  const current = status.value;
  if (current?.phase === 'queued') return phrase.value.upload_queued;
  if (current?.phase === 'processing' && current.progress !== undefined) {
    return `${phrase.value.upload_processing} ${Math.round(current.progress * 100)}%`;
  }
  return phrase.value.upload_processing;
});

async function useUnchanged() {
  await commitAndThen(createOriginalAssetSettings(), (asset) =>
    finish(asset, false),
  );
}

async function useRender() {
  const request = edit.request.value;
  if (!request) return;
  // Dry runs of the other stops would otherwise have the encoder's slots
  // first; the one being used is the only one still worth finishing.
  renders.abortExcept(primaryRenderKey.value);
  await commitAndThen(request, (asset) => finish(asset, false));
}

function toggleCropping() {
  cropping.value = !cropping.value;
  if (cropping.value) previewMode.value = 'edit';
}

/**
 * A reset frame covers the whole picture; it is shown ready to drag again,
 * rather than vanishing because cropping was off or a comparison was open.
 */
function resetCrop() {
  edit.resetCrop();
  cropping.value = true;
  previewMode.value = 'edit';
}

function rotate() {
  edit.rotate();
  // The source side of a comparison would turn at once and the result only
  // once rendered; the turned picture is shown instead.
  previewMode.value = 'edit';
}

async function createVariant() {
  const request: AssetUploadRequest | null = canZip.value
    ? createFileZipSettings()
    : edit.request.value;
  if (!request) return;
  const key = createKey.value;
  await commitAndThen(request, (asset) => {
    created.value = { key, asset };
    if (transformKind.value) previewMode.value = 'compare';
  });
}

async function commitAndThen(
  request: AssetUploadRequest,
  then: (asset: AssetVariantInfo) => void | Promise<void>,
) {
  errorText.value = '';
  busy.value = 'commit';
  try {
    const asset = await draftSession.withDraft((draft) =>
      commit(draft, request),
    );
    busy.value = null;
    await then(asset);
  } catch (error) {
    if (!handleAssetMissing(error))
      errorText.value = errorMessage(error, phrase.value.upload_error_apply);
  } finally {
    if (busy.value === 'commit') busy.value = null;
  }
}

async function finish(asset: AssetVariantInfo, confirm = true) {
  if (assetSelectionError(asset, props.modalData)) return;
  busy.value = 'finish';
  try {
    // A variant picked from the list may have gone since it was listed; one
    // just stored has been confirmed by storing it.
    if (confirm) await touch(asset.assetUuid);
    draftSession.close();
    emit('modalResult', { type: 'asset-ready', asset });
  } catch (error) {
    if (!handleAssetMissing(error))
      errorText.value = errorMessage(error, phrase.value.upload_error_apply);
  } finally {
    busy.value = null;
  }
}

function selectVariant(assetUuid: string) {
  selectedUuid.value = assetUuid;
  section.value = 'family';
}

function initialSection(): Section {
  if (props.modalData.librarySelection || sourceAsset) return 'family';
  const type = processingType.value;
  // An image is worth preparing for its place; a video or another file is
  // taken as it is unless asked, since creating a variant of it takes time.
  return type === AssetType.Image || (profile && type === AssetType.Video)
    ? 'create'
    : 'source';
}

/** The best file to derive from: the unprocessed original, or the largest. */
function pickProcessingSource(loaded: AssetVariantInfo[]): string {
  const media = loaded.filter((variant) => variant.type === sourceAsset?.type);
  const unprocessed = media.find((variant) => variant.isUnprocessed);
  if (unprocessed) return unprocessed.assetUuid;
  const area = (variant: AssetVariantInfo) => {
    const size = assetMetaDimensions(variant.meta);
    return size ? size.width * size.height : 0;
  };
  const largest = [...media].sort((a, b) => area(b) - area(a))[0];
  return largest?.assetUuid ?? sourceAsset?.assetUuid ?? '';
}

/** A library file gone since the editor opened sends the admin back. */
function handleAssetMissing(error: unknown) {
  const data =
    error && typeof error === 'object' && 'data' in error
      ? (error as { data?: { statusCode?: number; data?: unknown } }).data
      : undefined;
  if (sourceAsset && data?.statusCode === 404 && !data.data) {
    emit('modalResult', { type: 'asset-missing' });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Preview.

const previewSource = computed(() => {
  if (section.value === 'family' && selectedVariant.value) {
    const variant = selectedVariant.value;
    return {
      key: `variant:${variant.assetUuid}`,
      extension: variant.extension,
      src: variant.media?.src ?? variant.assetUrl,
      poster: videoPosterOf(variant.media),
      href: variant.assetUrl,
      isMedia: Boolean(variant.media),
      hasAudio:
        variant.type === AssetType.Video ? variant.meta?.hasAudio : undefined,
      dimensions: assetMetaDimensions(variant.meta),
    };
  }
  return {
    key: `source:${originKey.value}`,
    extension: processingExtension.value,
    src: processingSrc.value,
    poster: processingPoster.value,
    href: processingVariant.value?.assetUrl ?? pickedFile?.objectUrl ?? '',
    isMedia: Boolean(transformKind.value),
    hasAudio: transformSource.value?.hasAudio,
    dimensions: sourceDimensions.value,
  };
});

/** The source is being prepared for a new variant: shown as it will be cut. */
const editingSource = computed(
  () =>
    section.value === 'create' &&
    Boolean(transformKind.value) &&
    Boolean(transformSource.value),
);
/** Cropping is always on where the place fixes the proportions. */
const cropActive = computed(
  () => cropping.value || Boolean(edit.lockedAspect.value),
);
/**
 * The frame is out while cropping, and stays on show, untouchable, when a
 * crop was made and cropping ended, so the preview says what will be kept.
 */
const showCrop = computed(
  () =>
    editingSource.value &&
    // A video's comparison goes as soon as its settings change, since the
    // file it showed no longer matches them; the frame is back at once.
    !compare.value &&
    (cropActive.value || !edit.isWholeFrame.value),
);
const previewDimensions = computed(() =>
  editingSource.value && previewSource.value.key.startsWith('source:')
    ? edit.frame.value
    : previewSource.value.dimensions,
);
const previewRotation = computed(() =>
  editingSource.value ? edit.rotation.value : 0,
);

const compareOutput = computed(() => {
  if (transformKind.value !== 'image') return result.value;
  const render = renders.current.value ?? shownRender.value;
  return render
    ? {
        extension: render.extension,
        dimensions: { width: render.width, height: render.height },
        src: render.url,
      }
    : undefined;
});
const compare = computed(() => {
  if (section.value !== 'create' || previewMode.value !== 'compare')
    return null;
  const output = compareOutput.value;
  const crop = edit.cropRect.value;
  const frame = edit.frame.value;
  if (!output?.dimensions || !crop || !frame) return null;
  const rotation = edit.rotation.value;
  return {
    key: originKey.value,
    original: {
      key: `crop:${originKey.value}:${rotation}:${crop.left},${crop.top},${crop.width},${crop.height}`,
      extension: processingExtension.value,
      src: processingSrc.value,
      poster: processingPoster.value,
      hasAudio: transformSource.value?.hasAudio,
      displayDimensions: { width: crop.width, height: crop.height },
      crop: { rect: crop, source: frame, rotation },
    },
    modified: {
      key: `result:${output.src}`,
      extension: output.extension,
      src: output.src,
      hasAudio: transformSource.value?.hasAudio,
      displayDimensions: output.dimensions,
    },
  };
});
const canCompare = computed(
  () =>
    section.value === 'create' &&
    Boolean(compareOutput.value?.dimensions) &&
    Boolean(edit.cropRect.value),
);
const directHref = computed(() =>
  compare.value ? compare.value.modified.src : previewSource.value.href,
);
</script>

<template>
  <AssetModal :aside-title="phrase.upload_variants">
    <template #preview>
      <AssetModalCompareMedia
        v-if="compare"
        :key="`compare:${compare.key}`"
        :original="compare.original"
        :modified="compare.modified"
        :original-label="phrase.upload_compare_source"
        :modified-label="phrase.upload_compare_result"
        :modified-pending="transformKind === 'image' && renderPending"
      />
      <AssetModalPreviewMedia
        v-else-if="previewSource.isMedia && previewSource.src"
        :key="`media:${previewSource.key}`"
        ref="mediaPreview"
        :extension="previewSource.extension"
        :src="previewSource.src"
        :poster="previewSource.poster"
        :has-audio="previewSource.hasAudio"
        :display-dimensions="previewDimensions"
        :rotation="previewRotation"
      >
        <template v-if="showCrop && edit.frame.value" #overlay>
          <AssetCropBox
            v-model="edit.crop.value"
            :source="edit.frame.value"
            :aspect="edit.aspect.value"
            :shape="profile?.shape"
            :disabled="Boolean(busy) || !cropActive"
          />
        </template>
      </AssetModalPreviewMedia>
      <FilePreview
        v-else
        :key="`file:${previewSource.key}`"
        :extension="previewSource.extension"
        class="w-1/2 max-w-132 text-text-2"
      />
    </template>

    <template #buttons>
      <AssetModalButton
        v-if="directHref"
        :key="`direct:${directHref}`"
        icon="arrow-outward"
        target="_blank"
        :href="sitePath(directHref)"
        :data-title-popup="phrase.direct_link_to_asset"
        :aria-label="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="canCompare"
        icon="compare"
        :aria-pressed="previewMode === 'compare'"
        :aria-label="phrase.upload_preview_compare"
        :data-title-popup="phrase.upload_preview_compare"
        @click="previewMode = previewMode === 'compare' ? 'edit' : 'compare'"
      />
      <AssetModalButton
        v-if="!compare && previewSource.isMedia"
        @click="mediaPreview?.handleZoomButtonClick()"
      >
        <span class="text-xs font-bold transition">
          {{ mediaPreview?.zoomPercent ?? 100 }}%
        </span>
      </AssetModalButton>
    </template>

    <template #aside>
      <div class="flex flex-col">
        <p
          v-if="modalData.duplicateNotice"
          role="status"
          class="m-sm rounded-normal bg-bg-accent p-sm text-sm text-accent"
        >
          <Icon name="media" class="mr-xs" />{{ phrase.asset_hash_match }}
        </p>
        <p
          v-if="selectionError"
          role="status"
          class="m-sm rounded-normal bg-bg-warning p-sm text-sm
            text-text-warning"
        >
          {{
            selectionError === 'size'
              ? phrase.asset_selection_size
              : phrase.asset_selection_type
          }}
        </p>
        <div v-if="!modalData.librarySelection" class="p-sm">
          <Button
            variant="secondary"
            class="w-full"
            :data-title-popup="
              sourceAsset ? phrase.upload_replace_with_new_file_hint : undefined
            "
            @click="emit('modalResult', { type: 'upload-new' })"
          >
            <Icon name="file" class="mr-xs" />
            <span>
              {{
                sourceAsset
                  ? phrase.upload_replace_with_new_file
                  : phrase.pick_another_file
              }}
            </span>
          </Button>
        </div>

        <div
          v-if="errorText"
          role="alert"
          class="relative top-px border-y border-border-error bg-bg-error p-sm
            text-sm text-text-error"
        >
          <Icon name="warning" class="mr-xs" />
          <span>{{ errorText }}</span>
        </div>

        <template v-if="pickedFile">
          <UploadSettingsDivider />
          <UploadSettingsSection
            :active="section === 'source'"
            :title="phrase.upload_section_selected_file"
            @activate="section = 'source'"
          >
            <AssetModalFileInfo v-bind="sourceFileInfo" />
            <Button
              variant="primary"
              :disabled="Boolean(busy)"
              class="font-semibold"
              @click="useUnchanged"
            >
              <Icon
                :name="
                  busy && section === 'source' ? 'loading' : 'cloud-upload'
                "
                class="mr-xs"
              />
              <span>
                {{
                  busy === 'commit' && section === 'source'
                    ? busyLabel
                    : phrase.upload_use_unchanged
                }}
              </span>
            </Button>
          </UploadSettingsSection>
        </template>

        <template v-if="showFamily">
          <UploadSettingsDivider />
          <UploadSettingsSection
            :active="section === 'family'"
            :title="phrase.upload_section_family"
            @activate="section = 'family'"
          >
            <template #header-extra>
              <Icon v-if="loadingVariants" name="loading" class="text-text-2" />
            </template>
            <UploadSettingsVariantList
              v-if="variantItems.length"
              :items="variantItems"
              :selected-uuid="selectedUuid"
              @select="selectVariant"
            />
            <div v-else class="text-sm text-text-3">
              {{
                loadingVariants
                  ? phrase.upload_searching
                  : phrase.upload_no_matches
              }}
            </div>
            <Button
              variant="primary"
              :disabled="!canUseSelected"
              class="font-semibold"
              @click="selectedVariant && finish(selectedVariant)"
            >
              <Icon v-if="busy === 'finish'" name="loading" class="mr-xs" />
              <span>{{ phrase.upload_use_variant }}</span>
              <Icon name="chevron-right" class="ml-xs" />
            </Button>
          </UploadSettingsSection>
        </template>

        <template v-if="canCreate">
          <UploadSettingsDivider />
          <UploadSettingsSection
            :active="section === 'create'"
            :title="
              canZip ? phrase.upload_section_zip : phrase.upload_section_create
            "
            @activate="section = 'create'"
          >
            <div
              v-if="sourceAsset && Object.keys(processingOptions).length > 1"
              class="flex flex-col gap-xs"
            >
              <span class="text-sm text-text-2">
                {{ phrase.upload_processing_source }}
              </span>
              <FieldSelect
                v-model="processingUuid"
                :options="processingOptions"
                :disabled="Boolean(busy)"
              />
              <p v-if="processingIsCompressed" class="text-xs text-text-3">
                {{ phrase.upload_processing_source_lossy }}
              </p>
            </div>

            <UploadSettingsCreate
              v-if="transformKind"
              v-model:quality-level="edit.qualityLevel.value"
              v-model:format-choice="edit.formatChoice.value"
              v-model:strip-audio="edit.stripAudio.value"
              v-model:fast-conversion="edit.fastConversion.value"
              :kind="transformKind"
              :disabled="Boolean(busy)"
              :rotation="edit.rotation.value"
              :aspect-choice="edit.aspectChoice.value"
              :cropping="cropActive"
              :can-reset-crop="edit.canResetCrop.value"
              :locked-title="lockedTitle"
              :crop-size="edit.cropRect.value"
              :output="edit.outputDimensions.value"
              :linked="edit.linked.value"
              :can-reset-size="edit.canResetSize.value"
              :format-options="formatOptions"
              :source-size="sourceFileInfo.size"
              :quality-stops="qualityStops"
              :quality-detail="qualityDetail"
              :vector-kept="vectorKept"
              :source-has-audio="transformSource?.hasAudio"
              @aspect="edit.setAspectChoice"
              @toggle-crop="toggleCropping"
              @rotate="rotate"
              @reset-crop="resetCrop"
              @output-width="edit.setOutputWidth"
              @output-height="edit.setOutputHeight"
              @output-long-side="edit.setOutputLongSide"
              @linked="edit.setLinked"
              @reset-size="edit.resetSize"
            />
            <div v-else class="text-sm text-text-2">
              {{ phrase.upload_compress_to_zip_hint }}
            </div>

            <UploadSettingsResultPanel
              :pending="
                transformKind === 'image' &&
                (renderPending || draftSession.stagingProgress.value !== null)
              "
              :error="
                transformKind === 'image' ? renders.error.value : undefined
              "
              :source="sourceFileInfo"
              :result="result ?? expectedResult"
              :include-dimensions="Boolean(transformKind)"
              @retry="renders.retry()"
            >
              <Button
                v-if="transformKind !== 'image'"
                variant="secondary"
                :disabled="Boolean(busy) || Boolean(currentCreated)"
                @click="createVariant"
              >
                <Icon
                  :name="busy === 'commit' ? 'loading' : 'tune'"
                  class="mr-xs"
                />
                <span>
                  {{
                    busy === 'commit'
                      ? busyLabel
                      : canZip
                        ? phrase.upload_compress_to_zip
                        : phrase.upload_apply_settings
                  }}
                </span>
              </Button>
              <Button
                variant="primary"
                :disabled="
                  transformKind === 'image' ? !canUseRender : !canUseCreated
                "
                class="font-semibold"
                @click="
                  transformKind === 'image'
                    ? useRender()
                    : currentCreated && finish(currentCreated)
                "
              >
                <Icon
                  v-if="busy && transformKind === 'image'"
                  name="loading"
                  class="mr-xs"
                />
                <span>{{
                  busy === 'commit' && transformKind === 'image'
                    ? busyLabel
                    : phrase.upload_use
                }}</span>
                <Icon name="chevron-right" class="ml-xs" />
              </Button>
            </UploadSettingsResultPanel>
          </UploadSettingsSection>
        </template>
      </div>
    </template>
  </AssetModal>
</template>
