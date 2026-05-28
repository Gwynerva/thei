<script lang="ts" setup>
import {
  AssetType,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from '#layers/thei/shared/asset';
import type {
  AssetPickResult,
  AssetUploadResponse,
} from '#layers/thei/shared/api/asset';
import type { AssetProfileId } from '#layers/thei/shared/asset-profiles';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';
import AssetUploadPane from '#layers/thei/app/components/AssetUploadPane.vue';
import AssetDropZone from '#layers/thei/app/components/AssetDropZone.vue';
import AssetFilePreview from '#layers/thei/app/components/AssetFilePreview.vue';
import ShowcaseConfigPane from './ShowcaseConfigPane.vue';
import type { ShowcaseAssetAddedResult } from '../composables';
import type { FieldOptions } from '#layers/thei/app/components/field/FieldOptions.vue';

const props = defineProps<{
  onAdded?: (result: ShowcaseAssetAddedResult) => void;
  /** When provided: replace mode — skips ShowcaseConfigPane and fires this instead. */
  onReplaced?: (result: AssetPickResult) => void;
}>();

const modal = useModal();

type QualityTier = 'small' | 'normal' | 'high' | 'as-uploaded';

type FileInfo = {
  file: File;
  assetType: AssetType.Image | AssetType.Video;
  longSide: number;
};

const fileInfo = ref<FileInfo | null>(null);
const selectedTier = ref<QualityTier>('normal');
const errorMessage = ref<string | null>(null);

const IMAGE_EXTS = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXTS = new Set<string>(VIDEO_EXTENSIONS);

const formatSize = useHumanSize();

const showcaseMaxSizeBytes = Math.max(
  ...Object.values(ASSET_PROFILES)
    .filter((p) => p.id.startsWith('showcase-'))
    .map((p) => p.maxSizeBytes),
);
const acceptAttr = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]
  .map((e) => `.${e}`)
  .join(',');

const tierOptions = computed<FieldOptions>(() => {
  const longSide = fileInfo.value?.longSide ?? 0;
  const options: FieldOptions = {};

  // Only offer a size tier if the source is large enough to justify it
  // (no point advertising a 1920px output for a 200px image).
  if (longSide >= 640)
    options.small = { title: phrase.value.showcase_quality_small };
  if (longSide >= 1280)
    options.normal = { title: phrase.value.showcase_quality_normal };
  if (longSide >= 1920)
    options.high = { title: phrase.value.showcase_quality_high };
  options['as-uploaded'] = {
    title: phrase.value.showcase_quality_as_uploaded,
    description: fileInfo.value
      ? formatSize(fileInfo.value.file.size)
      : undefined,
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

async function handleFile(file: File) {
  errorMessage.value = null;
  const ext = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : '';

  let assetType: AssetType.Image | AssetType.Video;
  let dims: { w: number; h: number };

  if (IMAGE_EXTS.has(ext)) {
    assetType = AssetType.Image;
    try {
      dims = await getImageDimensions(file);
    } catch {
      dims = { w: 0, h: 0 };
    }
  } else if (VIDEO_EXTS.has(ext)) {
    assetType = AssetType.Video;
    try {
      dims = await getVideoDimensions(file);
    } catch {
      dims = { w: 0, h: 0 };
    }
  } else {
    errorMessage.value = `Unsupported file type: .${ext}`;
    return;
  }

  const longSide = Math.max(dims.w, dims.h);
  fileInfo.value = { file, assetType, longSide };

  // Auto-select the best tier: match the output resolution to the source.
  // If dimensions are unknown (longSide === 0), fall back to 'as-uploaded'.
  if (longSide >= 1920) selectedTier.value = 'high';
  else if (longSide >= 1280) selectedTier.value = 'normal';
  else if (longSide >= 640) selectedTier.value = 'small';
  else selectedTier.value = 'as-uploaded';
}

function onConfirm() {
  if (!fileInfo.value) return;
  const { file, assetType } = fileInfo.value;
  if (!(selectedTier.value in tierOptions.value)) return;
  const typeKey = assetType === AssetType.Video ? 'video' : 'image';
  const profileId =
    `showcase-${typeKey}-${selectedTier.value}` as AssetProfileId;

  modal.push({
    title:
      assetType === AssetType.Video
        ? phrase.value.showcase_upload_video
        : phrase.value.showcase_upload_image,
    component: AssetUploadPane,
    props: { profileId, initialFile: file },
    onBack(result: unknown) {
      if (!result) return;
      const r = result as AssetUploadResponse;
      const assetUrl = `/api/admin/assets/preview/${r.slug}.${r.extension}`;
      const previewUrl = r.videoPreviewUrl ?? assetUrl;
      const videoUrl = r.videoPreviewUrl ? assetUrl : undefined;

      // Replace mode: fire onReplaced and close without ShowcaseConfigPane
      if (props.onReplaced) {
        props.onReplaced({
          assetUuid: r.assetUuid,
          slug: r.slug,
          extension: r.extension,
          size: r.size,
          previewUrl,
          videoUrl,
          assetUrl,
        });
        modal.pop();
        return;
      }

      modal.push({
        title: phrase.value.showcase_details,
        component: ShowcaseConfigPane,
        props: {
          assetUuid: r.assetUuid,
          assetType,
          previewUrl,
          videoUrl,
          assetUrl,
          size: r.size,
          onAdded(addedResult: ShowcaseAssetAddedResult) {
            props.onAdded?.(addedResult);
          },
        },
      });
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-md">
    <!-- File drop zone (shown before file is picked) -->
    <AssetDropZone
      v-if="!fileInfo"
      :format-label="phrase.file_formats_images_videos"
      :max-size-bytes="showcaseMaxSizeBytes"
      :accept="acceptAttr"
      @file="handleFile"
    />

    <AssetFilePreview
      v-else
      :file="fileInfo.file"
      show-replace
      @replace="fileInfo = null"
    />

    <p v-if="errorMessage" class="text-red-500 text-sm">{{ errorMessage }}</p>

    <!-- Quality tier selector (only shown after file is selected) -->
    <template v-if="fileInfo">
      <Field>
        <FieldLabel>{{ phrase.showcase_quality }}</FieldLabel>
        <FieldOptions
          v-model="selectedTier"
          :options="tierOptions"
          direction="column"
        />
      </Field>

      <Button variant="primary" @click="onConfirm">
        {{ phrase.showcase_add }}
      </Button>
    </template>
  </div>
</template>
