<script lang="ts">
import type { AssetPickResult } from '#layers/thei/shared/api/asset';
import { buildAssetPreviewUrl } from '#layers/thei/shared/api/asset';

export function mapUploadResponseToPickResult(
  response: AssetUploadResponse,
): AssetPickResult {
  const assetUrl = buildAssetPreviewUrl(response.slug, response.extension);
  const previewUrl = response.videoPreviewUrl ?? assetUrl;
  const videoUrl = response.videoPreviewUrl ? assetUrl : undefined;
  return {
    assetUuid: response.assetUuid,
    slug: response.slug,
    extension: response.extension,
    size: response.size,
    previewUrl,
    videoUrl,
    assetUrl,
  };
}
</script>

<script lang="ts" setup>
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';
import type { AssetProfileId } from '#layers/thei/shared/asset-profiles';
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '#layers/thei/shared/asset';
import type { FieldOptions } from './field/FieldOptions.vue';
import AssetUploadPane from './AssetUploadPane.vue';
import AssetDropZone from './AssetDropZone.vue';
import AssetFilePreview from './AssetFilePreview.vue';

const props = defineProps<{
  imageProfileId: AssetProfileId;
  videoProfileId?: AssetProfileId;
  imageOriginalProfileId?: AssetProfileId;
  videoOriginalProfileId?: AssetProfileId;
}>();

const modal = useModal();
const errorMessage = ref<string | null>(null);
const pendingChoice = ref<
  | {
      file: File;
      optimizedProfileId: AssetProfileId;
      originalProfileId: AssetProfileId;
    }
  | undefined
>();
const formatSize = useHumanSize();

const IMAGE_EXTS = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXTS = new Set<string>(VIDEO_EXTENSIONS);

const imageProfile = computed(() => ASSET_PROFILES[props.imageProfileId]);
const videoProfile = computed(() =>
  props.videoProfileId ? ASSET_PROFILES[props.videoProfileId] : undefined,
);
const maxSizeBytes = computed(() => {
  const profileIds = [
    props.imageProfileId,
    props.imageOriginalProfileId,
    props.videoProfileId,
    props.videoOriginalProfileId,
  ].filter((profileId): profileId is AssetProfileId => Boolean(profileId));

  return Math.max(
    ...profileIds.map((profileId) => ASSET_PROFILES[profileId].maxSizeBytes),
  );
});

const formatLabel = computed(() =>
  props.videoProfileId
    ? phrase.value.file_formats_images_videos
    : phrase.value.file_formats_images,
);

const acceptAttr = computed(() => {
  const exts: string[] = [...IMAGE_EXTENSIONS];
  if (props.videoProfileId) exts.push(...VIDEO_EXTENSIONS);
  return exts.map((e) => `.${e}`).join(',');
});

function handleFile(file: File) {
  errorMessage.value = null;
  pendingChoice.value = undefined;
  const ext = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : '';

  let profileId: AssetProfileId;
  let profileLabel: string;

  if (IMAGE_EXTS.has(ext)) {
    profileId = props.imageProfileId;
    profileLabel = imageProfile.value.label;
    if (props.imageOriginalProfileId) {
      pendingChoice.value = {
        file,
        optimizedProfileId: props.imageProfileId,
        originalProfileId: props.imageOriginalProfileId,
      };
      return;
    }
  } else if (VIDEO_EXTS.has(ext) && props.videoProfileId) {
    profileId = props.videoProfileId;
    profileLabel = videoProfile.value!.label;
    if (props.videoOriginalProfileId) {
      pendingChoice.value = {
        file,
        optimizedProfileId: props.videoProfileId,
        originalProfileId: props.videoOriginalProfileId,
      };
      return;
    }
  } else {
    errorMessage.value = props.videoProfileId
      ? `Unsupported file type: .${ext}`
      : `Only images are accepted. Unsupported type: .${ext}`;
    return;
  }

  modal.push({
    title: profileLabel,
    component: AssetUploadPane,
    props: { profileId, initialFile: file },
    onBack(result: unknown) {
      if (!result) return;
      modal.pop(mapUploadResponseToPickResult(result as AssetUploadResponse));
    },
  });
}

const selectedProfile = ref<AssetProfileId | undefined>();

const choiceOptions = computed<FieldOptions>(() => {
  if (!pendingChoice.value) return {};
  const { optimizedProfileId, originalProfileId, file } = pendingChoice.value;
  return {
    [optimizedProfileId]: { title: phrase.value.asset_quality_optimized },
    [originalProfileId]: {
      title: phrase.value.other_quality_as_is,
      description: formatSize(file.size),
    },
  };
});

watch(pendingChoice, (choice) => {
  selectedProfile.value = choice?.optimizedProfileId;
});

function uploadWithProfile(profileId: AssetProfileId) {
  if (!pendingChoice.value) return;
  const file = pendingChoice.value.file;
  pendingChoice.value = undefined;
  modal.push({
    title: ASSET_PROFILES[profileId].label,
    component: AssetUploadPane,
    props: { profileId, initialFile: file },
    onBack(result: unknown) {
      if (!result) return;
      modal.pop(mapUploadResponseToPickResult(result as AssetUploadResponse));
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-md">
    <AssetDropZone
      v-if="!pendingChoice"
      :format-label="formatLabel"
      :max-size-bytes="maxSizeBytes"
      :accept="acceptAttr"
      @file="handleFile"
    />
    <p v-if="errorMessage && !pendingChoice" class="text-sm text-text-error">
      {{ errorMessage }}
    </p>

    <template v-if="pendingChoice">
      <AssetFilePreview
        :file="pendingChoice.file"
        show-replace
        @replace="pendingChoice = undefined"
      />
      <Field>
        <FieldLabel>{{ phrase.showcase_quality }}</FieldLabel>
        <FieldOptions
          v-model="selectedProfile"
          :options="choiceOptions"
          direction="column"
        />
      </Field>
      <Button
        variant="primary"
        @click="selectedProfile && uploadWithProfile(selectedProfile)"
      >
        {{ phrase.asset_pick_upload }}
      </Button>
    </template>
  </div>
</template>
