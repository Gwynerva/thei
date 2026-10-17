<script lang="ts" setup>
import type { ContentAssetData } from '#layers/thei/shared/content';

/**
 * The square a file of a text is shown by: its small preview for a picture
 * or a video, its kind's icon for any other. While the text is edited it is
 * the button that changes the file.
 */
const props = withDefaults(
  defineProps<{
    asset: ContentAssetData;
    editable?: boolean;
    editLabel?: string;
    /** A row of a list takes a smaller square than a card alone. */
    small?: boolean;
  }>(),
  { editable: false, editLabel: '', small: false },
);

const emit = defineEmits<{ edit: [] }>();

function onClick(event: MouseEvent) {
  if (!props.editable) return;
  event.stopPropagation();
  emit('edit');
}

/**
 * A picture or a video shown as a file still shows what it is, by its small
 * preview: the page loads only that, never the file, until it is opened. An
 * older video stored without a preview of its own has none to give.
 */
const thumbnailFailed = ref(false);
const thumbnail = computed(() => {
  const media = props.asset.media;
  if (!media || thumbnailFailed.value) return undefined;
  if (media.kind === 'video')
    return media.previewSrc && media.previewSrc !== media.src
      ? media.previewSrc
      : undefined;
  return media.previewSrc || media.src;
});
watch(
  () => props.asset.media?.previewSrc,
  () => (thumbnailFailed.value = false),
);
</script>

<template>
  <component
    :is="editable ? 'button' : 'span'"
    :type="editable ? 'button' : undefined"
    :data-drag-ignore="editable || undefined"
    :aria-label="editable ? editLabel : undefined"
    :data-title-popup="editable ? editLabel : undefined"
    class="file-tile relative flex shrink-0 items-center justify-center
      rounded-sm text-accent transition-colors"
    :class="[
      small ? 'size-12' : 'size-14 sm:size-16',
      {
        [`file-tile-editable cursor-pointer outline-none focus-visible:ring-2
        focus-visible:ring-accent`]: editable,
      },
    ]"
    @click="onClick"
  >
    <img
      v-if="thumbnail"
      :src="sitePath(thumbnail)"
      alt=""
      loading="lazy"
      decoding="async"
      draggable="false"
      class="size-full rounded-sm object-cover"
      data-attachment-thumbnail
      @error="thumbnailFailed = true"
    />
    <FilePreview
      v-else
      :extension="asset.extension"
      :class="small ? 'size-8' : 'size-10 sm:size-11'"
    />
    <span
      v-if="thumbnail && asset.media?.kind === 'video'"
      class="pointer-events-none absolute bottom-1 left-1 rounded-full
        bg-black/30 p-0.5 text-xs leading-none text-white backdrop-blur-sm"
      aria-hidden="true"
    >
      <Icon name="play-circle" />
    </span>
    <span
      v-if="editable"
      class="absolute -right-1 -bottom-1 flex size-6 items-center justify-center
        rounded-full border border-border-1 bg-bg-2 text-xs text-text-2
        shadow-sm"
      aria-hidden="true"
    >
      <Icon name="edit" />
    </span>
  </component>
</template>

<style scoped>
/*
 * Mixed with the surface under it rather than laid over it as transparency:
 * the file may lie on a pattern — the locks of a private section — and a
 * translucent tint would let it show through.
 */
.file-tile {
  background-color: color-mix(
    in oklab,
    var(--color-accent) 10%,
    var(--color-bg-2)
  );
}

.file-tile-editable:focus-visible {
  background-color: color-mix(
    in oklab,
    var(--color-accent) 20%,
    var(--color-bg-2)
  );
}

@media (hover: hover) {
  .file-tile-editable:hover {
    background-color: color-mix(
      in oklab,
      var(--color-accent) 20%,
      var(--color-bg-2)
    );
  }
}
</style>
