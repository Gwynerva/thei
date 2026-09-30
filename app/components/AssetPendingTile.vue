<script lang="ts" setup>
import type { PendingUpload } from '#layers/thei/app/composables/pending-upload';
import { uploadStatusLabel } from '#layers/thei/app/composables/upload-progress';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import AssetTile from './AssetTile.vue';
import UploadStatusBadge from './UploadStatusBadge.vue';

/**
 * A tile for a file still on its way into the library: the file as the
 * browser can already show it, a badge in a corner saying where the upload
 * is, and what to do about a failure. It stands in a list among real tiles
 * until the file lands.
 */
const props = defineProps<{
  upload: PendingUpload;
  cancelLabel?: string;
  retryLabel?: string;
  dismissLabel?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  retry: [];
}>();

// A video's still is the frame that shows it best, the same the server will
// choose; until it is found, and for a file that is no picture at all, the
// tile names the file's kind instead.
const videoPoster = useVideoPoster(() =>
  props.upload.preview.kind === 'video' ? props.upload.preview.src : undefined,
);
const pictureSrc = computed(() => {
  const { kind, src } = props.upload.preview;
  if (kind === 'image') return src;
  if (kind === 'video') return videoPoster.value;
  return undefined;
});
// Always a still: a video descriptor would start decoders on a file this
// large and play it on hover.
const media = computed<MediaDescriptor | undefined>(() =>
  pictureSrc.value
    ? { kind: 'image', src: pictureSrc.value, previewSrc: pictureSrc.value }
    : undefined,
);
const status = computed(() => props.upload.status.value);
const error = computed(() => props.upload.error.value);
const phase = computed(() =>
  error.value ? 'failed' : (status.value?.phase ?? 'queued'),
);
const label = computed(
  () => error.value ?? uploadStatusLabel(status.value ?? { phase: 'queued' }),
);
const labels = computed(() => ({
  cancel: props.cancelLabel ?? phrase.value.upload_cancel,
  retry: props.retryLabel ?? phrase.value.asset_upload_retry,
  dismiss: props.dismissLabel ?? phrase.value.upload_dismiss,
}));
</script>

<template>
  <AssetTile
    :media
    :extension="media ? undefined : upload.extension"
    data-drag-ignore
    data-pending-upload
    :data-pending-phase="phase"
    :aria-busy="!error"
    :aria-label="upload.name"
  >
    <!-- The corners: the way out top right, another try bottom left, and
         the badge bottom right, so that the picture stays in view. -->
    <template #overlay>
      <div
        class="pointer-events-none absolute inset-0 z-40 bg-bg-1/40"
        aria-hidden="true"
      />
      <UploadStatusBadge
        :status
        :error
        :label
        class="absolute right-1 bottom-1 z-50"
      />
      <span role="status" class="sr-only">{{ label }}</span>
      <button
        v-if="error"
        type="button"
        data-drag-ignore
        data-pending-retry
        class="pointer-events-auto absolute bottom-1 left-1 z-50 flex size-6
          cursor-pointer items-center justify-center rounded-full bg-bg-1/85
          text-xs text-text-2 shadow backdrop-blur-sm transition
          hocus:bg-bg-accent hocus:text-accent"
        :aria-label="labels.retry"
        :data-title-popup="labels.retry"
        @click.stop="emit('retry')"
      >
        <Icon name="refresh" />
      </button>
      <button
        type="button"
        data-drag-ignore
        data-pending-cancel
        class="pointer-events-auto absolute top-1 right-1 z-50 flex size-6
          cursor-pointer items-center justify-center rounded-full bg-bg-1/85
          text-xs text-text-2 shadow backdrop-blur-sm transition
          hocus:bg-bg-error hocus:text-text-error"
        :aria-label="error ? labels.dismiss : labels.cancel"
        :data-title-popup="error ? labels.dismiss : labels.cancel"
        @click.stop="emit('cancel')"
      >
        <Icon name="close" />
      </button>
    </template>
  </AssetTile>
</template>
