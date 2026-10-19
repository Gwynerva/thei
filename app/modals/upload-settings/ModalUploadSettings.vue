<script lang="ts" setup>
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import {
  archivedOriginalFromMeta,
  AssetType,
  assetMetaDimensions,
  type AudioAssetMeta,
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
  estimateAudioSize,
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
  type AssetAudioSource,
  type AssetAudioTransformSettings,
  type AssetImageFormat,
  type AssetUploadRequest,
} from '#layers/thei/shared/asset-upload-settings';
import { AUDIO_OUTPUT_EXTENSION } from '#layers/thei/shared/audio';
import { canZipAssetExtension } from '#layers/thei/shared/asset-upload-zip';
import {
  audioExtensionProfile,
  imageExtensionProfile,
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import type { SelectOption } from '../../components/field/FieldSelect.vue';
import AssetModal from '../asset-modal/AssetModal.vue';
import ModalHeaderButton from '../ModalHeaderButton.vue';
import FileDescriptionField from '../../components/FileDescriptionField.vue';
import AssetModalButton from '../asset-modal/AssetModalButton.vue';
import AssetModalCompareMedia from '../asset-modal/AssetModalCompareMedia.vue';
import AssetModalPreviewAudio from '../asset-modal/AssetModalPreviewAudio.vue';
import AssetModalPreviewMedia from '../asset-modal/AssetModalPreviewMedia.vue';
import FilePreviewContent from '../../components/file-preview/FilePreviewContent.vue';
import { useFileInfo } from '../asset-modal/use-file-info';
import { detectVideoAudio } from '../asset-modal/video-audio';
import AssetCropBox from './AssetCropBox.vue';
import UploadSettingsCreate from './UploadSettingsCreate.vue';
import UploadSettingsCreateAudio from './UploadSettingsCreateAudio.vue';
import UploadSettingsResultPanel from './UploadSettingsResultPanel.vue';
import UploadSettingsVariantList from './UploadSettingsVariantList.vue';
import {
  autoImageFormatDetail,
  imageFormatLabel,
  qualityStopLabels,
  variantDetail,
} from './format-labels';
import {
  buildQualityStops,
  draftRenderOrder,
  LOSSY_IMAGE_FORMATS,
  type StopSize,
} from './quality-stops';
import {
  errorMessage,
  isAbortError,
} from '#layers/thei/app/composables/upload-draft';
import { uploadStatusLabel } from '#layers/thei/app/composables/upload-progress';
import type { DiscreteBarStop } from '../../components/field/discrete-bar-stops';
import type { UploadSettingsFormatOption } from './UploadSettingsFormatList.vue';
import { useDraftRenders, type DraftRenderRequest } from './use-draft-renders';
import {
  draftOriginKey,
  useDraftSession,
  type DraftOrigin,
} from './use-draft-session';
import { useEditSettings } from './use-edit-settings';
import {
  useUploadSettingsAssets,
  type UploadSettingsModalData,
  type UploadSettingsResult,
} from './use-upload-settings-assets';

type Section = 'source' | 'family' | 'create';
/**
 * The panel goes one screen at a time: how to take the file, then what that
 * way needs — a saved variant to choose, the settings of a new one — and
 * last the file's description. `section` is what the preview and the
 * settings work on; a screen sets it as it opens.
 */
type Screen = 'root' | 'family' | 'create' | 'describe';

const emit = defineEmits<{
  modalResult: [result: UploadSettingsResult];
}>();

const props = defineProps<{
  modalData: UploadSettingsModalData;
}>();

const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');

const pickedFile =
  props.modalData.source.kind === 'file' ||
  props.modalData.source.kind === 'draft'
    ? props.modalData.source.file
    : null;
const sourceAsset =
  props.modalData.source.kind === 'asset' ? props.modalData.source.asset : null;
const profile = getAssetUploadProfileConfig(props.modalData.uploadProfile);

const { variants, status, commit, cancelCommit, touch } =
  useUploadSettingsAssets(props.modalData);

const errorText = ref('');
const busy = ref<'commit' | 'finish' | null>(null);
const selectedUuid = ref(sourceAsset?.assetUuid ?? '');
/**
 * The stored variant new settings apply to; empty for the picked file. The
 * family came with the file, so it is the best of it from the start, and
 * nothing in the panel changes under the admin once it is drawn.
 */
const processingUuid = ref(
  sourceAsset ? pickProcessingSource(variants.value) : '',
);
const previewMode = ref<'edit' | 'compare'>('edit');
/**
 * The crop frame is out for editing: from the start where the place has
 * proportions of its own, since the crop starts at them.
 */
const cropping = ref(Boolean(profile?.aspect));

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
    : props.modalData.source.kind === 'draft'
      ? {
          kind: 'draft',
          draft: props.modalData.source.draft,
          file: props.modalData.source.file,
        }
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
  if (isExtensionAllowed(processingExtension.value, audioExtensionProfile))
    return AssetType.Audio;
  return AssetType.Other;
});
const transformKind = computed<'image' | 'video' | 'audio' | undefined>(() =>
  processingType.value === AssetType.Image
    ? 'image'
    : processingType.value === AssetType.Video
      ? 'video'
      : processingType.value === AssetType.Audio
        ? 'audio'
        : undefined,
);
/** A kind with a frame: turned, cropped, sized and previewed as a picture. */
const frameKind = computed<'image' | 'video' | undefined>(() =>
  transformKind.value === 'audio' ? undefined : transformKind.value,
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
/** What the picked file spends a second, until the server reads its streams. */
const pickedBitrate = computed(() =>
  pickedFile && pickedDuration.value
    ? (pickedFile.size * 8) / pickedDuration.value
    : undefined,
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
  const bitrate = draft?.bitrate ?? videoMeta?.bitrate ?? pickedBitrate.value;
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

/**
 * Length, rate and channels of a recording: the server's probe once the
 * draft is open, the stored file's own reading for a library file, and until
 * then what the browser reads of the picked file.
 */
const audioSource = computed<AssetAudioSource | undefined>(() => {
  if (transformKind.value !== 'audio') return undefined;
  const draft = draftSession.draft.value;
  const variant = processingVariant.value;
  const meta =
    variant?.type === AssetType.Audio
      ? (variant.meta as AudioAssetMeta | null)
      : null;
  const duration =
    draft?.duration ?? (meta?.duration || undefined) ?? pickedDuration.value;
  const bitrate = draft?.bitrate ?? meta?.bitrate ?? pickedBitrate.value;
  const channels = draft?.channels ?? meta?.channels;
  return {
    ...(duration ? { duration } : {}),
    ...(bitrate ? { bitrate } : {}),
    ...(draft?.codec ? { codec: draft.codec } : {}),
    ...(channels ? { channels } : {}),
  };
});

const sourceFileInfo = computed(() => ({
  extension: processingExtension.value,
  size: processingVariant.value?.size ?? pickedFile?.size,
  dimensions: sourceDimensions.value,
  duration: transformSource.value?.duration ?? audioSource.value?.duration,
  channels: audioSource.value?.channels,
  bitrate: audioSource.value?.bitrate,
}));

const processingIsCompressed = computed(
  () =>
    isAssetTransformSettings(processingVariant.value?.settings) ||
    processingVariant.value?.settings?.type === 'audio-transform',
);

// ---------------------------------------------------------------------------
// Settings for a new variant, and what they produce.

const screen = ref<Screen>('root');
/** The screen the file was taken on: where Back from the description goes. */
const takenOn = ref<Screen>('root');
/** The file being handed over, stored, waiting only for its description. */
const taken = shallowRef<AssetVariantInfo>();
/** As it is: the stored file itself, or the picked one as it came. */
const section = ref<Section>(rootSection());

// "Auto" picks by the sizes the renders below measure, and the renders are
// asked for by these settings: the sizes reach the settings through a
// function, read only once both exist.
const edit = useEditSettings({
  kind: () => transformKind.value,
  source: () =>
    transformKind.value === 'audio' ? audioSource.value : transformSource.value,
  profile: () => profile,
  formatSizes: () => formatSizes(),
});

const rendersActive = computed(
  () => section.value === 'create' && transformKind.value === 'image',
);
/** The image formats the current settings are rendered in. */
const renderedFormats = computed<readonly AssetImageFormat[]>(() => {
  if (!rendersActive.value) return [];
  return edit.fixedFormat.value
    ? [edit.fixedFormat.value]
    : edit.availableFormats.value;
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
 * Every dry run worth having, the most wanted first: what "Use" would store,
 * then the current settings in the other formats, so each shows its real
 * size, then every other quality stop in the format it would be stored in,
 * so the bar shows real sizes too — nearest stops first.
 */
const renderRequests = computed<DraftRenderRequest[]>(() => {
  if (!rendersActive.value) return [];
  return draftRenderOrder({
    format: edit.format.value,
    formatChoice: edit.formatChoice.value,
    fixedFormat: edit.fixedFormat.value,
    availableFormats: renderedFormats.value,
    level: edit.qualityLevel.value,
  }).flatMap(({ format, level }) =>
    renderRequest(
      edit.settingsAt(
        level === undefined
          ? { format }
          : { format, quality: ASSET_QUALITY_LEVEL_QUALITY[level] },
      ),
    ),
  );
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

/**
 * "Auto" is still weighing the sizes it picks by. Only its own row says so:
 * the result and "Use" go by the render "Auto" stands on meanwhile, and
 * when a smaller format comes in, its render is already there to switch to.
 */
const autoPending = computed(
  () =>
    rendersActive.value &&
    !edit.fixedFormat.value &&
    edit.formatChoice.value === 'auto' &&
    !edit.autoFormat.value?.reason &&
    AUTO_IMAGE_FORMATS.some((format) => renders.isPending(formatKey(format))),
);
const renderPending = computed(() => renders.pending.value);

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
  if (resolved.type === 'audio-transform') {
    const size = audioStopSize(resolved);
    return {
      extension: AUDIO_OUTPUT_EXTENSION,
      ...(size ? { size: size.bytes, approximate: size.approximate } : {}),
    };
  }
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
  const resolved = edit.resolved.value;
  const output =
    resolved && 'dimensions' in resolved ? resolved.dimensions : undefined;
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

/** What a recording comes out at with these settings: an estimate, always. */
function audioStopSize(
  settings: AssetAudioTransformSettings,
): StopSize | undefined {
  const source = audioSource.value;
  const estimate = source ? estimateAudioSize(settings, source) : undefined;
  return estimate ? { bytes: estimate.bytes, approximate: true } : undefined;
}

/** What the file comes out at on a stop, whatever kind it is. */
function stopSize(stop: AssetQualityStop): StopSize | undefined {
  if (transformKind.value === 'image') return imageStopSize(stop);
  if (stop === 'lossless') return undefined;
  const at = edit.settingsAt({ quality: ASSET_QUALITY_LEVEL_QUALITY[stop] });
  if (!at) return undefined;
  return at.settings.type === 'audio-transform'
    ? audioStopSize(at.settings)
    : videoStopSize(at.settings);
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

/** The place's proportions, offered as a choice of their own when none is. */
const placeRatio = computed(() =>
  edit.placeAspectChoice.value === 'place'
    ? getAssetUploadProfileAspect(props.modalData.uploadProfile)?.ratio
    : undefined,
);

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
    // One this very editor is placing is not going anywhere.
    ...(variant.usageCount
      ? {}
      : {
          deleteAfter: variant.deleteAfter,
          inHistory: variant.inHistory,
          heldByAi: variant.heldByAi,
        }),
    isCurrent: variant.assetUuid === sourceAsset?.assetUuid,
    detail: variantDetail(variant.settings),
    recipe: describeAssetRecipe(variant.settings, variant.meta, phrase.value),
  })),
);
/**
 * Worded as the list above words them: the format and the size, and under
 * them how the file was made, which the narrow panel has no room for in the
 * field itself.
 */
const processingOptions = computed<SelectOption[]>(() =>
  sortedVariants.value
    .filter((variant) => variant.type === sourceAsset?.type)
    .map((variant) => {
      const size = assetMetaDimensions(variant.meta);
      return {
        value: variant.assetUuid,
        label: [
          variant.extension.toUpperCase(),
          size ? `${size.width}×${size.height}` : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
        hint: variantDetail(variant.settings),
      };
    }),
);
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
    Boolean(renders.current.value),
);
const canUseCreated = computed(
  () => !busy.value && Boolean(currentCreated.value) && !selectionError.value,
);
/**
 * A recording is stored in one press: its encode takes seconds, so "Use"
 * makes it if "Apply" has not, and listening first stays a choice.
 */
const canUseAudio = computed(() =>
  currentCreated.value
    ? canUseCreated.value
    : !busy.value && Boolean(edit.request.value),
);
/** "Use" is storing the recording itself; "Apply" shows no progress then. */
const usingDirectly = ref(false);
const canUseSelected = computed(
  () => !busy.value && Boolean(selectedVariant.value) && !selectionError.value,
);

const busyLabel = computed(() =>
  uploadStatusLabel(
    draftSession.stagingProgress.value !== null
      ? { phase: 'staging', progress: draftSession.stagingProgress.value }
      : status.value,
  ),
);

async function useUnchanged() {
  await commitAndThen(createOriginalAssetSettings(), (asset) =>
    take(asset, false),
  );
}

async function useRender() {
  const request = edit.request.value;
  if (!request) return;
  // Dry runs of the other stops would otherwise have the encoder's slots
  // first; the one being used is the only one still worth finishing.
  renders.hold(primaryRenderKey.value);
  let taken = false;
  await commitAndThen(request, async (asset) => {
    taken = await take(asset, false);
  });
  if (!taken) renders.release();
}

async function useAudio() {
  if (currentCreated.value) {
    await take(currentCreated.value);
    return;
  }
  const request = edit.request.value;
  if (!request) return;
  const key = createKey.value;
  usingDirectly.value = true;
  try {
    await commitAndThen(request, (asset) => {
      // Stored either way: when this place cannot take it, the modal stays
      // on it and says why, and the next "Use" does not store it again.
      created.value = { key, asset };
      return take(asset, false);
    });
  } finally {
    usingDirectly.value = false;
  }
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
  then: (asset: AssetVariantInfo) => unknown,
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
    // Cancelled by the admin: nothing to say about it.
    if (isAbortError(error)) return;
    if (!handleAssetMissing(error))
      errorText.value = errorMessage(error, phrase.value.upload_error_apply);
  } finally {
    if (busy.value === 'commit') busy.value = null;
  }
}

/**
 * Takes the file it will hand over, and goes on to its description; false
 * when the modal stays where it is instead.
 */
async function take(asset: AssetVariantInfo, confirm = true) {
  if (assetSelectionError(asset, props.modalData)) return false;
  busy.value = 'finish';
  try {
    // A variant picked from the list may have gone since it was listed; one
    // just stored has been confirmed by storing it.
    if (confirm) await touch(asset.assetUuid);
    taken.value = asset;
    takenOn.value = screen.value;
    screen.value = 'describe';
    return true;
  } catch (error) {
    if (!handleAssetMissing(error))
      errorText.value = errorMessage(error, phrase.value.upload_error_apply);
    return false;
  } finally {
    busy.value = null;
  }
}

/** Hands the file over: the last step is done, or skipped on purpose. */
function done() {
  if (!taken.value) return;
  draftSession.close();
  emit('modalResult', { type: 'asset-ready', asset: taken.value });
}

const descriptionField =
  useTemplateRef<InstanceType<typeof FileDescriptionField>>('descriptionField');
/** «Готово»: the description saved, the file handed over. */
async function describeAndFinish() {
  if (await descriptionField.value?.save()) done();
}

/** The section a screen works on, as it opens. */
function rootSection(): Section {
  if (sourceAsset) {
    selectedUuid.value = sourceAsset.assetUuid;
    return 'family';
  }
  return 'source';
}

function open(next: Screen) {
  errorText.value = '';
  if (next === 'root') section.value = rootSection();
  if (next === 'family') section.value = 'family';
  if (next === 'create') section.value = 'create';
  screen.value = next;
}

/**
 * One screen back. From the description, the file taken stays stored: the
 * next way chosen is taken anew, and what nothing uses goes with the
 * cleanup.
 */
function back() {
  if (busy.value) cancelCommit();
  if (screen.value === 'describe') {
    taken.value = undefined;
    renders.release();
    screen.value = takenOn.value;
    return;
  }
  open('root');
}

/** «Далее» on the first screen: the file as it is. */
async function takeAsIs() {
  if (!sourceAsset) {
    await useUnchanged();
    return;
  }
  if (selectedVariant.value) await take(selectedVariant.value);
}

function selectVariant(assetUuid: string) {
  selectedUuid.value = assetUuid;
  section.value = 'family';
}

const screenTitle = computed(
  () =>
    ({
      root: phrase.value.upload_how,
      family: phrase.value.upload_section_family,
      create: canZip.value
        ? phrase.value.upload_section_zip
        : phrase.value.upload_new_variant,
      describe: phrase.value.asset,
    })[screen.value],
);

/** The file as it is, in a line: what «Как есть» takes. */
const asIsSummary = computed(() => {
  const info = sourceAsset
    ? {
        extension: sourceAsset.extension,
        size: sourceAsset.size,
        dimensions: assetMetaDimensions(sourceAsset.meta),
      }
    : sourceFileInfo.value;
  return [
    info.extension?.toUpperCase(),
    info.dimensions
      ? `${info.dimensions.width} × ${info.dimensions.height}`
      : undefined,
    info.size !== undefined ? humanSize(info.size) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
});
/** Stored variants other than the file as it is. */
const savedCount = computed(
  () =>
    variants.value.filter(
      (variant) => variant.assetUuid !== sourceAsset?.assetUuid,
    ).length,
);
const newVariantHint = computed(() =>
  canZip.value
    ? phrase.value.upload_new_zip_hint
    : transformKind.value === 'audio'
      ? phrase.value.upload_new_audio_hint
      : phrase.value.upload_new_variant_hint,
);

/** What the foot's one button does on this screen, and whether it can. */
const step = computed<{ label: string; can: boolean; run: () => unknown }>(
  () => {
    const next = phrase.value.upload_next;
    if (screen.value === 'root')
      return {
        label: next,
        can: sourceAsset ? canUseSelected.value : !busy.value,
        run: takeAsIs,
      };
    if (screen.value === 'family')
      return {
        label: next,
        can: canUseSelected.value,
        run: () => selectedVariant.value && take(selectedVariant.value),
      };
    if (transformKind.value === 'image')
      return { label: next, can: canUseRender.value, run: useRender };
    if (transformKind.value === 'audio')
      return { label: next, can: canUseAudio.value, run: useAudio };
    // A video or an archive is made first, and looked at, then taken.
    if (!currentCreated.value)
      return {
        label: canZip.value
          ? phrase.value.upload_compress_to_zip
          : phrase.value.upload_apply_settings,
        can: !busy.value,
        run: createVariant,
      };
    const made = currentCreated.value;
    return { label: next, can: canUseCreated.value, run: () => take(made) };
  },
);

/** The best file to derive from: the unprocessed original, or the largest. */
function pickProcessingSource(loaded: AssetVariantInfo[]): string {
  const media = loaded.filter((variant) => variant.type === sourceAsset?.type);
  const unprocessed = media.find((variant) => variant.isUnprocessed);
  if (unprocessed) return unprocessed.assetUuid;
  // The most a file holds: its pixels, or a recording's bits per second.
  const area = (variant: AssetVariantInfo) => {
    if (variant.type === AssetType.Audio) return variant.meta?.bitrate ?? 0;
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

/**
 * A stored file shown as it is: the variant picked from the list, or, on the
 * last screen, the one taken — never the source under the frame it was cut
 * with.
 */
const shownVariant = computed(() =>
  screen.value === 'describe'
    ? taken.value
    : section.value === 'family'
      ? selectedVariant.value
      : undefined,
);

const previewSource = computed(() => {
  if (shownVariant.value) {
    const variant = shownVariant.value;
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
      size: variant.size,
      file: undefined,
      archivedOriginal: archivedOriginalFromMeta(variant?.meta),
    };
  }
  return {
    key: `source:${originKey.value}`,
    extension: processingExtension.value,
    src: processingSrc.value,
    poster: processingPoster.value,
    href: processingVariant.value?.assetUrl ?? pickedFile?.objectUrl ?? '',
    isMedia: Boolean(frameKind.value),
    hasAudio: transformSource.value?.hasAudio,
    dimensions: sourceDimensions.value,
    size: processingVariant.value?.size ?? pickedFile?.size ?? 0,
    // A file not uploaded yet is read where it lies.
    file: processingVariant.value ? undefined : pickedFile?.file,
    archivedOriginal: archivedOriginalFromMeta(processingVariant.value?.meta),
  };
});

/**
 * A recording is listened to rather than shown: the file in view, and once a
 * new version is made from it, that version under it.
 */
const audioPlayers = computed(() => {
  if (shownVariant.value) {
    const variant = shownVariant.value;
    if (variant.type !== AssetType.Audio) return [];
    return [
      {
        key: `variant:${variant.assetUuid}`,
        src: variant.assetUrl,
        extension: variant.extension,
        duration: variant.meta?.duration,
        peaks: variant.meta?.peaks,
      },
    ];
  }
  if (transformKind.value !== 'audio' || !processingSrc.value) return [];
  const meta =
    processingVariant.value?.type === AssetType.Audio
      ? processingVariant.value.meta
      : null;
  const made =
    section.value === 'create' && currentCreated.value?.type === AssetType.Audio
      ? currentCreated.value
      : undefined;
  return [
    {
      key: `source:${originKey.value}`,
      src: processingSrc.value,
      extension: processingExtension.value,
      duration: meta?.duration ?? audioSource.value?.duration,
      peaks: meta?.peaks,
      label: made ? phrase.value.upload_processing_source : undefined,
    },
    ...(made
      ? [
          {
            key: `result:${made.assetUuid}`,
            src: made.assetUrl,
            extension: made.extension,
            duration: made.meta?.duration,
            peaks: made.meta?.peaks,
            label: phrase.value.upload_result,
          },
        ]
      : []),
  ];
});

/** The source is being prepared for a new variant: shown as it will be cut. */
const editingSource = computed(
  () =>
    section.value === 'create' &&
    !shownVariant.value &&
    Boolean(transformKind.value) &&
    Boolean(transformSource.value),
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
    (cropping.value || !edit.isWholeFrame.value),
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
  if (
    section.value !== 'create' ||
    shownVariant.value ||
    previewMode.value !== 'compare'
  )
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
    !shownVariant.value &&
    Boolean(compareOutput.value?.dimensions) &&
    Boolean(edit.cropRect.value),
);
const directHref = computed(() =>
  compare.value ? compare.value.modified.src : previewSource.value.href,
);
</script>

<template>
  <AssetModal
    :aside-title="screenTitle"
    :aside-icon="screen === 'root' ? 'tune' : undefined"
  >
    <template #preview>
      <AssetModalCompareMedia
        v-if="compare"
        :key="`compare:${compare.key}`"
        :original="compare.original"
        :modified="compare.modified"
        :original-label="phrase.upload_processing_source"
        :modified-label="phrase.upload_result"
        :modified-pending="transformKind === 'image' && renderPending"
      />
      <AssetModalPreviewAudio
        v-else-if="audioPlayers.length"
        :players="audioPlayers"
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
            :disabled="Boolean(busy) || !cropping"
          />
        </template>
      </AssetModalPreviewMedia>
      <FilePreviewContent
        v-else
        :key="`file:${previewSource.key}`"
        :src="previewSource.file ? undefined : previewSource.href"
        :file="previewSource.file"
        :extension="previewSource.extension"
        :size="previewSource.size"
        :archived-original="previewSource.archivedOriginal"
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

    <template v-if="screen !== 'root'" #lead>
      <ModalHeaderButton
        icon="chevron-left"
        size="compact"
        :label="phrase.upload_back"
        data-upload-back
        @click="back"
      />
    </template>

    <template #aside>
      <div class="flex flex-col text-sm" :data-upload-screen="screen">
        <p
          v-if="selectionError && screen !== 'describe'"
          role="status"
          class="m-sm rounded-normal bg-bg-warning p-sm text-text-warning"
        >
          {{
            selectionError === 'size'
              ? phrase.asset_selection_size
              : phrase.asset_selection_type
          }}
        </p>
        <div
          v-if="errorText"
          role="alert"
          class="border-b border-border-error bg-bg-error p-sm text-text-error"
        >
          <Icon name="warning" class="mr-xs" />
          <span>{{ errorText }}</span>
        </div>

        <!-- How to take the file: as it is goes on at once; a saved variant
             and a new one open their own screen; another file goes back to
             the picker. The last row closes the list. -->
        <div
          v-if="screen === 'root'"
          role="radiogroup"
          :aria-label="phrase.upload_how"
          class="flex flex-col divide-y divide-border-1 border-b
            border-border-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked="true"
            class="flex w-full cursor-default items-center gap-xs px-sm py-2.5
              text-left"
            data-upload-as-is
          >
            <span
              class="size-4 shrink-0 rounded-full border-4 border-accent"
            ></span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-semibold">{{ phrase.upload_as_is }}</span>
              <span class="truncate text-xs text-text-3 tabular-nums">{{
                asIsSummary
              }}</span>
            </span>
          </button>
          <button
            v-if="savedCount"
            type="button"
            role="radio"
            aria-checked="false"
            class="flex w-full cursor-pointer items-center gap-xs px-sm py-2.5
              text-left transition-colors hocus:bg-bg-3"
            data-upload-saved
            @click="open('family')"
          >
            <span
              class="size-4 shrink-0 rounded-full border-2 border-border-2"
            ></span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-semibold">{{
                phrase.upload_saved_variant
              }}</span>
              <span class="truncate text-xs text-text-3 tabular-nums">{{
                phrase.upload_saved_count(savedCount)
              }}</span>
            </span>
            <Icon name="chevron-right" class="shrink-0 text-text-3" />
          </button>
          <button
            v-if="canCreate"
            type="button"
            role="radio"
            aria-checked="false"
            class="flex w-full cursor-pointer items-center gap-xs px-sm py-2.5
              text-left transition-colors hocus:bg-bg-3"
            data-upload-new
            @click="open('create')"
          >
            <span
              class="size-4 shrink-0 rounded-full border-2 border-border-2"
            ></span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-semibold">{{ phrase.upload_new_variant }}</span>
              <span class="truncate text-xs text-text-3">{{
                newVariantHint
              }}</span>
            </span>
            <Icon name="chevron-right" class="shrink-0 text-text-3" />
          </button>
          <button
            v-if="!modalData.librarySelection"
            type="button"
            class="flex w-full cursor-pointer items-center gap-xs px-sm py-2.5
              text-left transition-colors hocus:bg-bg-3"
            data-upload-other
            @click="emit('modalResult', { type: 'upload-new' })"
          >
            <Icon name="file" class="shrink-0 text-text-2" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-semibold">{{
                phrase.upload_replace_with_new_file
              }}</span>
              <span class="truncate text-xs text-text-3">{{
                phrase.upload_other_file_hint
              }}</span>
            </span>
          </button>
        </div>

        <div v-else-if="screen === 'family'" class="p-sm">
          <UploadSettingsVariantList
            :items="variantItems"
            :selected-uuid="selectedUuid"
            @select="selectVariant"
          />
        </div>

        <div v-else-if="screen === 'create'" class="flex flex-col gap-sm p-sm">
          <div
            v-if="sourceAsset && processingOptions.length > 1"
            class="flex flex-col gap-xs"
          >
            <span class="text-text-2">
              {{ phrase.upload_processing_source }}
            </span>
            <FieldSelect
              v-model="processingUuid"
              :options="processingOptions"
              :disabled="Boolean(busy)"
              :aria-label="phrase.upload_processing_source"
              wide
            />
            <p v-if="processingIsCompressed" class="text-xs text-text-3">
              {{ phrase.upload_processing_source_lossy }}
            </p>
          </div>

          <UploadSettingsCreateAudio
            v-if="transformKind === 'audio'"
            v-model:quality-level="edit.qualityLevel.value"
            v-model:mono="edit.mono.value"
            :disabled="Boolean(busy)"
            :quality-stops="qualityStops"
            :quality-detail="qualityDetail"
            :source-channels="audioSource?.channels"
          />
          <UploadSettingsCreate
            v-else-if="frameKind"
            v-model:quality-level="edit.qualityLevel.value"
            v-model:format-choice="edit.formatChoice.value"
            v-model:strip-audio="edit.stripAudio.value"
            v-model:fast-conversion="edit.fastConversion.value"
            :kind="frameKind"
            :disabled="Boolean(busy)"
            :rotation="edit.rotation.value"
            :aspect-choice="edit.aspectChoice.value"
            :cropping="cropping"
            :can-reset-crop="edit.canResetCrop.value"
            :place-ratio="placeRatio"
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
          <div v-else class="text-text-2">
            {{ phrase.upload_compress_to_zip_hint }}
          </div>

          <UploadSettingsResultPanel
            :pending="
              transformKind === 'image' &&
              (renderPending || draftSession.stagingProgress.value !== null)
            "
            :error="transformKind === 'image' ? renders.error.value : undefined"
            :source="sourceFileInfo"
            :result="result ?? expectedResult"
            :include-dimensions="Boolean(frameKind)"
            @retry="renders.retry()"
          />
        </div>

        <!-- Last, what the file is: the same for every place it goes. -->
        <div v-else-if="taken" class="p-sm">
          <FileDescriptionField
            ref="descriptionField"
            :key="taken.assetUuid"
            :asset-uuid="taken.assetUuid"
            global
            embedded
            required
          />
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="screen === 'describe'">
        <ModalHeaderButton
          icon="face-dead"
          :label="phrase.upload_skip_description"
          data-upload-skip-description
          @click="done"
        />
        <Button
          variant="primary"
          class="flex h-9 flex-1 items-center justify-center gap-xs
            font-semibold"
          :disabled="!descriptionField?.filled || descriptionField?.saving"
          data-upload-done
          @click="describeAndFinish"
        >
          <Icon v-if="descriptionField?.saving" name="loading" />
          <span>{{ phrase.done }}</span>
        </Button>
      </template>
      <template v-else>
        <Button
          variant="primary"
          class="flex h-9 min-w-0 flex-1 items-center justify-center gap-xs
            font-semibold"
          :disabled="!step.can"
          data-upload-next
          @click="step.run()"
        >
          <Icon v-if="busy" name="loading" class="shrink-0" />
          <span class="truncate">{{
            busy === 'commit' ? busyLabel : step.label
          }}</span>
        </Button>
        <ModalHeaderButton
          v-if="busy === 'commit'"
          icon="close"
          :label="phrase.upload_cancel"
          data-upload-cancel
          @click="cancelCommit"
        />
      </template>
    </template>
  </AssetModal>
</template>
