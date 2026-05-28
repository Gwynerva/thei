<script lang="ts" setup>
import {
  AssetType,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from '#layers/thei/shared/asset';
import type {
  AssetReplaceResult,
  AssetUploadResponse,
} from '#layers/thei/shared/api/asset';
import type { AssetProfileId } from '#layers/thei/shared/asset-profiles';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';
import type { FieldOptions } from '#layers/thei/app/components/field/FieldOptions.vue';
import AssetUploadPane from '#layers/thei/app/components/AssetUploadPane.vue';
import AssetDropZone from '#layers/thei/app/components/AssetDropZone.vue';
import AssetFilePreview from '#layers/thei/app/components/AssetFilePreview.vue';
import OtherConfigPane from './OtherConfigPane.vue';
import type { OtherAssetAddedResult } from '../composables';

const props = defineProps<{
  onAdded?: (result: OtherAssetAddedResult) => void;
  /** When provided: replace mode — skips OtherConfigPane and fires this instead. */
  onReplaced?: (result: AssetReplaceResult) => void;
}>();

const modal = useModal();
const formatSize = useHumanSize();

type QualityTier = 'small' | 'normal' | 'high' | 'as-uploaded' | 'as-is';

type FileInfo = {
  file: File;
  extension: string;
  assetType: AssetType.Image | AssetType.Video | AssetType.Other;
  longSide: number;
};

const fileInfo = ref<FileInfo | null>(null);
const selectedTier = ref<QualityTier>('normal');
const errorMessage = ref<string | null>(null);

const IMAGE_EXTS = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXTS = new Set<string>(VIDEO_EXTENSIONS);

const otherMaxSizeBytes = Math.max(
  ...Object.values(ASSET_PROFILES).map((p) => p.maxSizeBytes),
);

const tierOptions = computed<FieldOptions>(() => {
  const info = fileInfo.value;
  if (!info || info.assetType === AssetType.Other) return {};

  const options: FieldOptions = {};
  const longSide = info.longSide;

  if (longSide >= 640)
    options.small = { title: phrase.value.showcase_quality_small };
  if (longSide >= 1280)
    options.normal = { title: phrase.value.showcase_quality_normal };
  if (longSide >= 1920)
    options.high = { title: phrase.value.showcase_quality_high };

  options['as-uploaded'] = {
    title: phrase.value.showcase_quality_as_uploaded,
  };

  options['as-is'] = {
    title: phrase.value.other_quality_as_is,
    description: formatSize(info.file.size),
  };

  return options;
});

watch(tierOptions, (options) => {
  const availableTiers = Object.keys(options) as QualityTier[];
  if (availableTiers.length === 0) return;
  if (!availableTiers.includes(selectedTier.value)) {
    selectedTier.value = availableTiers[0]!;
  }
});

async function getImageDimensions(
  file: File,
): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

async function getVideoDimensions(
  file: File,
): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ w: video.videoWidth, h: video.videoHeight });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Video load failed'));
    };
    video.src = url;
  });
}

function profileFor(
  assetType: AssetType.Image | AssetType.Video,
  tier: QualityTier,
): AssetProfileId {
  if (tier === 'as-is') {
    return assetType === AssetType.Video ? 'other-video-raw' : 'raw';
  }

  const typeKey = assetType === AssetType.Video ? 'video' : 'image';
  return `showcase-${typeKey}-${tier}` as AssetProfileId;
}

function mapUploadResult(
  upload: AssetUploadResponse,
  kind: FileInfo['assetType'],
): AssetReplaceResult {
  const assetUrl = `/api/admin/assets/preview/${upload.slug}.${upload.extension}`;
  const previewUrl = upload.videoPreviewUrl
    ? upload.videoPreviewUrl
    : kind === AssetType.Image
      ? assetUrl
      : undefined;
  const videoUrl = upload.videoPreviewUrl ? assetUrl : undefined;

  return {
    assetUuid: upload.assetUuid,
    slug: upload.slug,
    extension: upload.extension,
    size: upload.size,
    previewUrl,
    videoUrl,
    assetUrl,
  };
}

function pushUpload(
  title: string,
  profileId: AssetProfileId,
  file: File,
  kind: FileInfo['assetType'],
) {
  modal.push({
    title,
    component: AssetUploadPane,
    props: { profileId, initialFile: file },
    onBack(result: unknown) {
      if (!result) return;
      const mapped = mapUploadResult(result as AssetUploadResponse, kind);

      if (props.onReplaced) {
        props.onReplaced(mapped);
        modal.pop();
        return;
      }

      modal.push({
        title: phrase.value.other_details,
        component: OtherConfigPane,
        props: {
          assetUuid: mapped.assetUuid,
          extension: mapped.extension,
          previewUrl: mapped.previewUrl,
          videoUrl: mapped.videoUrl,
          assetUrl: mapped.assetUrl,
          size: mapped.size,
          onAdded(addedResult: OtherAssetAddedResult) {
            props.onAdded?.(addedResult);
          },
        },
      });
    },
  });
}

async function handleFile(file: File) {
  errorMessage.value = null;
  const extension = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : '';

  if (IMAGE_EXTS.has(extension)) {
    let dims = { w: 0, h: 0 };
    try {
      dims = await getImageDimensions(file);
    } catch {
      // fallback to as-uploaded when dimensions are unknown
    }
    const longSide = Math.max(dims.w, dims.h);
    fileInfo.value = {
      file,
      extension,
      assetType: AssetType.Image,
      longSide,
    };
    if (longSide >= 1920) selectedTier.value = 'high';
    else if (longSide >= 1280) selectedTier.value = 'normal';
    else if (longSide >= 640) selectedTier.value = 'small';
    else selectedTier.value = 'as-uploaded';
    return;
  }

  if (VIDEO_EXTS.has(extension)) {
    let dims = { w: 0, h: 0 };
    try {
      dims = await getVideoDimensions(file);
    } catch {
      // fallback to as-uploaded when dimensions are unknown
    }
    const longSide = Math.max(dims.w, dims.h);
    fileInfo.value = {
      file,
      extension,
      assetType: AssetType.Video,
      longSide,
    };
    if (longSide >= 1920) selectedTier.value = 'high';
    else if (longSide >= 1280) selectedTier.value = 'normal';
    else if (longSide >= 640) selectedTier.value = 'small';
    else selectedTier.value = 'as-uploaded';
    return;
  }

  // Unknown extension: upload directly as raw without profile choice.
  fileInfo.value = { file, extension, assetType: AssetType.Other, longSide: 0 };
  pushUpload(phrase.value.other_add, 'raw', file, AssetType.Other);
}

function onConfirm() {
  if (!fileInfo.value) return;
  if (fileInfo.value.assetType === AssetType.Other) return;
  if (!(selectedTier.value in tierOptions.value)) return;

  const profileId = profileFor(fileInfo.value.assetType, selectedTier.value);
  const title =
    fileInfo.value.assetType === AssetType.Video
      ? phrase.value.showcase_upload_video
      : phrase.value.showcase_upload_image;

  pushUpload(title, profileId, fileInfo.value.file, fileInfo.value.assetType);
}
</script>

<template>
  <div class="flex flex-col gap-md">
    <!-- File drop zone (shown before file is picked) -->
    <AssetDropZone
      v-if="!fileInfo"
      :format-label="phrase.file_formats_any"
      :max-size-bytes="otherMaxSizeBytes"
      @file="handleFile"
    />

    <AssetFilePreview
      v-else-if="fileInfo.assetType !== AssetType.Other"
      :file="fileInfo.file"
      show-replace
      @replace="fileInfo = null"
    />

    <p v-if="errorMessage" class="text-red-500 text-sm">{{ errorMessage }}</p>

    <template v-if="fileInfo && fileInfo.assetType !== AssetType.Other">
      <Field>
        <FieldLabel>{{ phrase.showcase_quality }}</FieldLabel>
        <FieldOptions
          v-model="selectedTier"
          :options="tierOptions"
          direction="column"
        />
      </Field>

      <Button variant="primary" @click="onConfirm">
        {{ phrase.other_add }}
      </Button>
    </template>
  </div>
</template>
