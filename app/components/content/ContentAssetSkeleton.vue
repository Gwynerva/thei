<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { PendingUpload } from '#layers/thei/app/composables/pending-upload';
import { uploadStatusLabel } from '#layers/thei/app/composables/upload-progress';
import UploadStatusBadge from '../UploadStatusBadge.vue';

const props = defineProps<{
  icon: IconName;
  label: string;
  readOnly?: boolean;
  /**
   * A file on its way — pasted, and being stored. The block shows it faintly
   * with where it is, so it has its picture and its shape before the file is
   * stored, and offers the asset editor for it under `editLabel`.
   */
  upload?: PendingUpload;
  editLabel?: string;
  retryLabel?: string;
}>();

const emit = defineEmits<{
  pick: [];
  edit: [];
  retry: [];
}>();

// A video's still is the frame that shows it best — the same the server
// will choose — rather than its first frame, which is often black.
const videoPoster = useVideoPoster(() =>
  props.upload?.preview.kind === 'video' ? props.upload.preview.src : undefined,
);
const previewSrc = computed(() => {
  const preview = props.upload?.preview;
  if (preview?.kind === 'image') return preview.src;
  if (preview?.kind === 'video') return videoPoster.value;
  return undefined;
});
const status = computed(() => props.upload?.status.value ?? null);
const error = computed(() => props.upload?.error.value);
const label = computed(() => error.value ?? uploadStatusLabel(status.value));
</script>

<template>
  <!-- The buttons stand beside the placeholder, not inside it: a button
       cannot hold another. -->
  <div class="relative overflow-hidden rounded-normal bg-bg-accent">
    <img
      v-if="upload && previewSrc"
      :src="previewSrc"
      alt=""
      draggable="false"
      data-content-asset-preview
      class="pointer-events-none mx-auto block max-h-144 max-w-full opacity-35"
    />
    <button
      type="button"
      data-drag-ignore
      class="group flex w-full items-center justify-center text-accent/45
        transition-colors outline-none hocus:bg-accent/20 hocus:text-accent"
      :class="upload && previewSrc ? 'absolute inset-0' : 'h-34'"
      :disabled="readOnly || Boolean(upload)"
      :aria-label="label"
      :aria-busy="Boolean(upload) && !error"
      @click="emit('pick')"
    >
      <Icon
        v-if="!upload"
        :name="icon"
        class="text-6xl transition-colors"
        aria-hidden="true"
      />
    </button>
    <div
      v-if="upload"
      class="pointer-events-none absolute inset-0 flex items-center
        justify-center gap-sm"
    >
      <UploadStatusBadge :status :error :label large />
      <span role="status" data-content-asset-status class="sr-only">{{
        label
      }}</span>
      <button
        v-if="error"
        type="button"
        data-drag-ignore
        data-content-asset-retry
        class="pointer-events-auto flex size-12 cursor-pointer items-center
          justify-center rounded-full bg-bg-1/85 text-2xl text-text-2 shadow
          backdrop-blur-sm transition hocus:bg-bg-accent hocus:text-accent"
        :aria-label="retryLabel"
        :data-title-popup="retryLabel"
        @click.stop="emit('retry')"
      >
        <Icon name="refresh" />
      </button>
    </div>
    <button
      v-if="upload && editLabel"
      type="button"
      data-drag-ignore
      data-content-asset-edit
      class="absolute top-xs right-xs z-20 flex size-9 cursor-pointer
        items-center justify-center rounded-full bg-bg-1/80 text-text-2 shadow
        backdrop-blur-sm transition hocus:bg-bg-1 hocus:text-text-1"
      :aria-label="editLabel"
      @click.stop="emit('edit')"
    >
      <Icon name="edit" />
    </button>
  </div>
</template>
