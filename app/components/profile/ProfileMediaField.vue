<script setup lang="ts">
import {
  getAssetUploadProfileConfig,
  type AssetUploadProfile,
} from '#layers/thei/shared/asset-upload-profiles';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { imageExtensionProfile } from '#layers/thei/shared/assets/extensions';
const props = defineProps<{
  title: string;
  description?: string;
  profile: AssetUploadProfile;
  imageOnly?: boolean;
  wide?: boolean;
  compact?: boolean;
  hideLabel?: boolean;
  detailsAside?: boolean;
  shape?: 'normal' | 'circle';
  /** A function when counting is costly: it is asked only as the editor opens. */
  usageDelta?: Record<string, number> | (() => Record<string, number>);
}>();
const assetUuid = defineModel<string | null>({ required: true });
const media = defineModel<MediaDescriptor | undefined>('media');
const error = ref<string>();
/** A wide tile takes the proportions of the place it fills. */
const wideAspect = computed(() => {
  const aspect = getAssetUploadProfileConfig(props.profile)?.aspect;
  return aspect ? `${aspect.width} / ${aspect.height}` : '3 / 1';
});
const slot = useSingleMediaAsset({
  uploadProfile: props.profile,
  asideTitle: () => props.title,
  getAssetUuid: () => assetUuid.value ?? undefined,
  setAssetUuid: (value) => {
    assetUuid.value = value ?? null;
  },
  media,
  accept: props.imageOnly ? [imageExtensionProfile] : undefined,
  usageDelta: () =>
    (typeof props.usageDelta === 'function'
      ? props.usageDelta()
      : props.usageDelta) ?? {},
  onError: (e) => {
    error.value = e instanceof Error ? e.message : String(e);
  },
});
</script>
<template>
  <Field class="min-w-0">
    <div
      :class="
        detailsAside ? 'flex min-w-0 flex-wrap items-center gap-sm' : 'contents'
      "
    >
      <div
        v-if="!hideLabel && !detailsAside"
        class="flex flex-wrap items-center gap-xs"
      >
        <FieldLabel>{{ title }}</FieldLabel>
        <AssetAspectHint :profile />
      </div>
      <AssetTile
        :media="media"
        :shape
        :aria-label="title"
        :overlay="{ showVideo: true, editable: true }"
        :class="wide ? 'h-24 max-w-full' : compact ? 'size-12' : 'size-24'"
        :style="wide ? { aspectRatio: wideAspect } : undefined"
        class="shrink-0 cursor-pointer"
        @click="slot.open()"
      />
      <div v-if="!hideLabel && detailsAside" class="flex-1 tracking-tight">
        <FieldLabel>{{ title }}</FieldLabel>
        <p v-if="description" class="text-sm text-text-2">
          {{ description }}
        </p>
        <AssetAspectHint :profile class="mt-1" />
      </div>
    </div>
    <p v-if="error" class="text-sm text-text-error">{{ error }}</p>
  </Field>
</template>
