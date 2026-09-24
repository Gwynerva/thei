import {
  cropFractionToRect,
  cropRectToFraction,
  FULL_CROP_FRACTION,
  maximizeCropRect,
  reshapeCropRect,
  rotateCropFraction,
  rotatedDimensions,
  type AssetCropFraction,
  type AssetRotation,
} from '#layers/thei/shared/asset-crop';
import {
  recommendImageFormat,
  type AutoImageFormat,
} from '#layers/thei/shared/asset-image-format-auto';
import {
  ASSET_QUALITY_LEVEL_QUALITY,
  assetQualityLevelOf,
  DEFAULT_IMAGE_QUALITY_LEVEL,
  DEFAULT_VIDEO_QUALITY_LEVEL,
  type AssetQualityStop,
} from '#layers/thei/shared/asset-quality-levels';
import type { FileDimensions } from '#layers/thei/shared/asset-upload-dimensions';
import type { AssetUploadProfileConfig } from '#layers/thei/shared/asset-upload-profiles';
import {
  assetImageFormatsFor,
  buildAssetSettingsKey,
  resolveAssetUploadSettings,
  type AssetImageFormat,
  type AssetTransformRequest,
  type AssetTransformSettings,
  type AssetTransformSource,
  type AssetUploadDimensions,
} from '#layers/thei/shared/asset-upload-settings';

export type FormatChoice = 'auto' | AssetImageFormat;

/** Crop proportions offered when the place does not fix one. */
export const CROP_ASPECT_CHOICES = {
  free: undefined,
  source: undefined,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
} as const;
export type CropAspectChoice = keyof typeof CROP_ASPECT_CHOICES;

const DEFAULT_IMAGE_QUALITY =
  ASSET_QUALITY_LEVEL_QUALITY[DEFAULT_IMAGE_QUALITY_LEVEL];
const DEFAULT_VIDEO_QUALITY =
  ASSET_QUALITY_LEVEL_QUALITY[DEFAULT_VIDEO_QUALITY_LEVEL];

/**
 * What the admin is asking a new variant to be.
 *
 * The source may be turned a quarter at a time; the crop is then measured in
 * the turned frame, the one the preview shows. It is kept as fractions of that
 * frame, so it survives switching to another processing source of the same
 * picture.
 *
 * The output size is linked to the crop's proportions unless the admin
 * unlinks it; the sides are then taken exactly and the picture stretched.
 *
 * Quality is one of the named levels, kept as the number the level stands
 * for. Lossless is a stop past them that is a format rather than a quality,
 * so it is a flag of its own: leaving it goes back to the level it was left
 * from.
 *
 * The place's defaults are applied once, when the source is first known, and
 * never again over the admin's own changes.
 */
export function useEditSettings(options: {
  kind: () => 'image' | 'video' | undefined;
  source: () => AssetTransformSource | undefined;
  profile: () => AssetUploadProfileConfig | undefined;
  /** Size each format comes out at with the current settings, once known. */
  formatSizes: () => Partial<Record<AssetImageFormat, number>>;
}) {
  const quality = ref(DEFAULT_IMAGE_QUALITY);
  const lossless = ref(false);
  const formatChoice = ref<FormatChoice>('auto');
  const aspectChoice = ref<CropAspectChoice>('free');
  const rotation = ref<AssetRotation>(0);
  const crop = ref<AssetCropFraction>(FULL_CROP_FRACTION);
  /** A box the output is fitted into; the whole crop when absent. */
  const outputBox = ref<AssetUploadDimensions | undefined>();
  /** The output keeps the crop's proportions. */
  const linked = ref(true);
  /** Both sides, taken as they are, while unlinked. */
  const exact = ref<FileDimensions | undefined>();
  const stripAudio = ref(false);
  const fastConversion = ref(false);
  const touched = ref(false);

  const lockedAspect = computed(() => {
    const aspect = options.profile()?.aspect;
    return aspect ? aspect.width / aspect.height : undefined;
  });
  const fixedFormat = computed(() => options.profile()?.imageFormat);
  /** A place that fixes the format must not get another one, lossless included. */
  const canBeLossless = computed(() => !fixedFormat.value);

  /** The bar's stop: a level, or lossless past them. */
  const qualityLevel = computed<AssetQualityStop>({
    get: () =>
      lossless.value && canBeLossless.value
        ? 'lossless'
        : assetQualityLevelOf(quality.value),
    set: (stop) => {
      if (stop === 'lossless') {
        lossless.value = true;
        return;
      }
      lossless.value = false;
      quality.value = ASSET_QUALITY_LEVEL_QUALITY[stop];
    },
  });

  /** The source as turned: the frame the crop is measured in. */
  const frame = computed(() => {
    const source = options.source();
    return source ? rotatedDimensions(source, rotation.value) : undefined;
  });

  /** Width over height the crop keeps, in source pixels. */
  const aspect = computed<number | undefined>(() => {
    if (lockedAspect.value) return lockedAspect.value;
    if (aspectChoice.value === 'source') {
      return frame.value ? frame.value.width / frame.value.height : undefined;
    }
    return CROP_ASPECT_CHOICES[aspectChoice.value];
  });

  const cropRect = computed(() =>
    frame.value ? cropFractionToRect(crop.value, frame.value) : undefined,
  );

  /** The request with every choice made except, for images, the format. */
  const geometryRequest = computed<AssetTransformRequest | null>(() => {
    const kind = options.kind();
    if (!kind || !cropRect.value) return null;
    const common = {
      quality: quality.value,
      ...(rotation.value ? { rotation: rotation.value } : {}),
      crop: cropRect.value,
      ...(!linked.value && exact.value
        ? { dimensions: { ...exact.value }, stretch: true }
        : { dimensions: outputBox.value ?? {} }),
    };
    return kind === 'image'
      ? { type: 'image-transform', ...common }
      : {
          type: 'video-transform',
          ...common,
          stripAudio: stripAudio.value,
          fastConversion: fastConversion.value,
        };
  });

  const outputDimensions = computed<FileDimensions | undefined>(() => {
    const source = options.source();
    const request = geometryRequest.value;
    if (!source || !request) return undefined;
    return (
      resolveAssetUploadSettings(request, source) as AssetTransformSettings
    ).dimensions;
  });

  const autoFormat = computed<AutoImageFormat | undefined>(() =>
    outputDimensions.value
      ? recommendImageFormat(options.formatSizes(), options.source()?.isVector)
      : undefined,
  );

  const format = computed<AssetImageFormat | undefined>(() => {
    if (lossless.value && canBeLossless.value) return 'webp-lossless';
    return (
      fixedFormat.value ??
      (formatChoice.value === 'auto'
        ? autoFormat.value?.format
        : formatChoice.value)
    );
  });
  // AVIF has no lossless mode here: the choice falls back to "Auto", which
  // resolves to the lossless WebP the stop means.
  watch(lossless, (on) => {
    if (on && formatChoice.value === 'avif') formatChoice.value = 'auto';
  });

  const request = computed<AssetTransformRequest | null>(() => {
    const geometry = geometryRequest.value;
    if (!geometry) return null;
    return geometry.type === 'image-transform' && format.value
      ? { ...geometry, format: format.value }
      : geometry;
  });

  /** Every format this source can be written in, the choice among them. */
  const availableFormats = computed(() =>
    assetImageFormatsFor(Boolean(options.source()?.isVector)),
  );

  /**
   * The current settings at another quality or in another format, resolved,
   * with the key they are stored under: what a dry run of another stop asks
   * for, and what an estimate of it is made from.
   */
  function settingsAt(at: { quality?: number; format?: AssetImageFormat }) {
    const geometry = geometryRequest.value;
    const source = options.source();
    if (!geometry || !source) return undefined;
    const withQuality =
      at.quality === undefined
        ? geometry
        : { ...geometry, quality: at.quality };
    const request: AssetTransformRequest =
      withQuality.type === 'image-transform'
        ? { ...withQuality, format: at.format ?? format.value }
        : withQuality;
    const settings = resolveAssetUploadSettings(
      request,
      source,
    ) as AssetTransformSettings;
    return { request, settings, key: buildAssetSettingsKey(settings) };
  }

  const resolved = computed(() => {
    const source = options.source();
    return request.value && source
      ? (resolveAssetUploadSettings(
          request.value,
          source,
        ) as AssetTransformSettings)
      : undefined;
  });
  const settingsKey = computed(() =>
    resolved.value ? buildAssetSettingsKey(resolved.value) : '',
  );

  /**
   * "Reset" goes back to the crop's own size. Whether it is offered follows
   * the size setting alone, not the pixels it comes out at: those meet the
   * crop's and part again at every step of a drag of the frame.
   */
  const canResetSize = computed(
    () => !linked.value || outputBox.value !== undefined,
  );

  const placeDefaults = computed(() => {
    const profile = options.profile();
    const source = options.source();
    const kind = options.kind();
    // A place's quality is one of the levels; anything else lands on the
    // nearest, so the bar always stands on a stop.
    const placeQuality =
      kind === 'video'
        ? (profile?.videoQuality ?? DEFAULT_VIDEO_QUALITY)
        : (profile?.imageQuality ?? DEFAULT_IMAGE_QUALITY);
    return {
      quality: ASSET_QUALITY_LEVEL_QUALITY[assetQualityLevelOf(placeQuality)],
      outputBox: profile?.box ? { ...profile.box } : undefined,
      crop:
        source && lockedAspect.value
          ? cropRectToFraction(
              maximizeCropRect(source, lockedAspect.value),
              source,
            )
          : FULL_CROP_FRACTION,
      stripAudio: Boolean(profile?.stripAudio) && source?.hasAudio !== false,
    };
  });
  // Any change the admin makes marks the settings as theirs; the editor's own
  // assignments below are made with `applying` set and do not.
  let applying = false;
  watch(
    [
      quality,
      lossless,
      formatChoice,
      aspectChoice,
      rotation,
      crop,
      outputBox,
      linked,
      exact,
      stripAudio,
      fastConversion,
    ],
    () => {
      if (!applying) touched.value = true;
    },
    { deep: true, flush: 'sync' },
  );
  function programmatic(change: () => void) {
    applying = true;
    try {
      change();
    } finally {
      applying = false;
    }
  }

  let applied = false;
  watch(
    () => Boolean(options.source() && options.kind()),
    (ready) => {
      if (!ready || applied || touched.value) return;
      applied = true;
      applyPlaceDefaults();
    },
    { immediate: true },
  );

  // Another source of the same picture: the crop stays where it was, only
  // brought back to the field's exact proportions if the frame changed shape.
  watch(
    () => {
      const source = options.source();
      return source ? `${source.width}x${source.height}` : '';
    },
    (key, previous) => {
      const turned = frame.value;
      if (!turned || !previous || key === previous) return;
      const rect = cropRect.value;
      if (aspect.value && rect) {
        programmatic(() => {
          crop.value = cropRectToFraction(
            reshapeCropRect(rect, turned, aspect.value!),
            turned,
          );
        });
      }
    },
  );

  function applyPlaceDefaults() {
    const target = placeDefaults.value;
    programmatic(() => {
      quality.value = target.quality;
      lossless.value = false;
      rotation.value = 0;
      outputBox.value = target.outputBox;
      linked.value = true;
      exact.value = undefined;
      crop.value = target.crop;
      formatChoice.value = 'auto';
      aspectChoice.value = 'free';
      stripAudio.value = target.stripAudio;
      fastConversion.value = false;
    });
  }

  function setAspectChoice(choice: CropAspectChoice) {
    aspectChoice.value = choice;
    reshapeToAspect();
  }

  /**
   * Turns the picture a quarter clockwise. The frame turns with it, so it
   * keeps framing the same part of the picture; a fixed proportion is then
   * restored around that part.
   */
  function rotate() {
    // A frame as large as the proportions allow stays that large: turned to
    // a portrait and back, a fixed proportion must not have shrunk on the way.
    const wasLargest = isLargestCrop.value;
    const edited = cropEdited.value;
    rotation.value = ((rotation.value + 90) % 360) as AssetRotation;
    crop.value = rotateCropFraction(crop.value);
    // The size turns with the picture, unless the place fixes its shape.
    if (!lockedAspect.value) {
      outputBox.value = outputBox.value && swapSides(outputBox.value);
      exact.value = exact.value && (swapSides(exact.value) as FileDimensions);
    }
    if (wasLargest) {
      crop.value = resetCropTarget.value;
      cropEdited.value = edited;
    } else {
      reshapeToAspect();
    }
  }

  function reshapeToAspect() {
    const turned = frame.value;
    const rect = cropRect.value;
    if (!turned || !rect || !aspect.value) return;
    crop.value = cropRectToFraction(
      reshapeCropRect(rect, turned, aspect.value),
      turned,
    );
  }

  /** The largest frame the proportions allow: where "Reset" goes. */
  const resetCropTarget = computed(() =>
    frame.value
      ? cropRectToFraction(
          maximizeCropRect(frame.value, aspect.value),
          frame.value,
        )
      : FULL_CROP_FRACTION,
  );
  const isLargestCrop = computed(() =>
    sameCrop(crop.value, resetCropTarget.value),
  );
  /**
   * The admin has changed the frame since it was last reset. "Reset" follows
   * that rather than the geometry, which meets the largest frame and leaves
   * it again at every step of a drag along an edge.
   */
  const cropEdited = ref(false);
  watch(
    crop,
    () => {
      if (!applying) cropEdited.value = true;
    },
    { flush: 'sync' },
  );
  const canResetCrop = computed(() => cropEdited.value);
  /** Nothing is cut off. */
  const isWholeFrame = computed(() => sameCrop(crop.value, FULL_CROP_FRACTION));

  function resetCrop() {
    crop.value = resetCropTarget.value;
    cropEdited.value = false;
  }

  function setOutputWidth(width: number | undefined) {
    if (linked.value) outputBox.value = width ? { width } : undefined;
    else setExact({ width });
  }

  function setOutputHeight(height: number | undefined) {
    if (linked.value) outputBox.value = height ? { height } : undefined;
    else setExact({ height });
  }

  /** One side while unlinked, kept to what the crop allows. */
  function setExact(side: Partial<FileDimensions>) {
    const current = outputDimensions.value;
    if (!current) return;
    exact.value = { ...current, ...exact.value, ...definedSides(side) };
    // Read back through the recipe, so an oversized side shows as stored.
    if (outputDimensions.value) exact.value = { ...outputDimensions.value };
  }

  function setOutputLongSide(longSide: number | undefined) {
    linked.value = true;
    exact.value = undefined;
    outputBox.value = longSide
      ? { width: longSide, height: longSide }
      : undefined;
  }

  /**
   * Unlinking keeps the size as it is and frees the sides; linking again
   * keeps the width and lets the height follow the crop.
   */
  function setLinked(value: boolean) {
    const current = outputDimensions.value;
    if (value === linked.value || !current) return;
    if (value) {
      linked.value = true;
      exact.value = undefined;
      outputBox.value = { width: current.width };
    } else {
      exact.value = { ...current };
      linked.value = false;
    }
  }

  function resetSize() {
    setOutputLongSide(undefined);
  }

  return {
    quality,
    lossless,
    qualityLevel,
    canBeLossless,
    formatChoice,
    aspectChoice,
    rotation,
    crop,
    outputBox,
    stripAudio,
    fastConversion,
    touched,
    lockedAspect,
    fixedFormat,
    linked,
    canResetSize,
    frame,
    aspect,
    cropRect,
    outputDimensions,
    autoFormat,
    format,
    request,
    resolved,
    settingsKey,
    availableFormats,
    settingsAt,
    setAspectChoice,
    rotate,
    canResetCrop,
    isWholeFrame,
    resetCrop,
    setOutputWidth,
    setOutputHeight,
    setOutputLongSide,
    setLinked,
    resetSize,
  };
}

function swapSides(size: AssetUploadDimensions): AssetUploadDimensions {
  return {
    ...(size.height ? { width: size.height } : {}),
    ...(size.width ? { height: size.width } : {}),
  };
}

function definedSides(side: Partial<FileDimensions>): Partial<FileDimensions> {
  return {
    ...(side.width ? { width: side.width } : {}),
    ...(side.height ? { height: side.height } : {}),
  };
}

function sameCrop(left: AssetCropFraction, right: AssetCropFraction): boolean {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.0005;
  return (
    close(left.left, right.left) &&
    close(left.top, right.top) &&
    close(left.width, right.width) &&
    close(left.height, right.height)
  );
}
