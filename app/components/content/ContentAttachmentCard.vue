<script lang="ts" setup>
import type { ContentAssetData } from '#layers/thei/shared/content';
import { isAssetPreviewable } from '#layers/thei/shared/assets/preview';

const props = withDefaults(
  defineProps<{
    asset: ContentAssetData;
    title?: string;
    caption?: string;
    editable?: boolean;
    href?: string;
    fallbackTitle?: string;
    editLabel?: string;
    titlePlaceholder?: string;
    captionPlaceholder?: string;
    openable?: boolean;
  }>(),
  {
    title: '',
    caption: '',
    editable: false,
    href: undefined,
    fallbackTitle: '',
    editLabel: '',
    titlePlaceholder: '',
    captionPlaceholder: '',
  },
);

const emit = defineEmits<{
  edit: [];
  title: [value: string];
  caption: [value: string];
  open: [];
}>();

const humanSize = useHumanSize();

/**
 * A file with something to show — a picture, a video, a text, a table, a
 * page, a PDF, an archive's list — opens in the asset viewer; any other is
 * simply downloaded. Opening goes through the viewer, which needs the
 * file's address too. Without the viewer, a picture or a video opens in a
 * tab of its own.
 */
const viewable = computed(() => !!props.asset.media);
const previewable = computed(
  () =>
    viewable.value ||
    (!!props.asset.extension &&
      isAssetPreviewable(props.asset.extension, props.asset.archivedOriginal)),
);
const mode = computed(() => {
  if (props.editable || !props.href) return 'static';
  return props.openable && previewable.value ? 'open' : 'link';
});
function onPreviewClick(event: MouseEvent) {
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

// The owner's title gets their typography; a file name stays as it is.
const resolvedTitle = computed(
  () => publicText(props.title) || props.fallbackTitle,
);
const details = computed(() =>
  [
    props.asset.extension?.toUpperCase(),
    props.asset.size !== undefined ? humanSize(props.asset.size) : undefined,
  ].filter(Boolean),
);
</script>

<template>
  <!-- The caption stands under the card, as a picture's does: it may hold a
       link, which the card's own link or button cannot. -->
  <figure class="min-w-0" data-content-attachment>
    <component
      :is="mode === 'open' ? 'button' : mode === 'link' ? 'a' : 'div'"
      :type="mode === 'open' ? 'button' : undefined"
      :href="mode === 'link' ? sitePath(href) : undefined"
      :target="mode === 'link' && viewable ? '_blank' : undefined"
      :rel="mode === 'link' ? 'noopener noreferrer' : undefined"
      :download="mode === 'link' && !viewable ? '' : undefined"
      class="attachment-card group relative flex w-full min-w-0 items-center
        gap-sm rounded-normal border border-border-1 bg-bg-2 p-xs text-left
        text-text-1 no-underline transition-colors outline-none sm:pr-sm"
      :class="
        mode === 'static'
          ? 'focus-within:border-accent/50'
          : `attachment-card-interactive cursor-pointer focus-visible:ring-2
            focus-visible:ring-accent hocus:border-accent/40`
      "
      @click="mode === 'open' ? emit('open') : undefined"
    >
      <component
        :is="editable ? 'button' : 'span'"
        :type="editable ? 'button' : undefined"
        :data-drag-ignore="editable || undefined"
        :aria-label="editable ? editLabel : undefined"
        :data-title-popup="editable ? editLabel : undefined"
        class="attachment-card-tile relative flex size-14 shrink-0 items-center
          justify-center rounded-sm text-accent transition-colors sm:size-16"
        :class="{
          [`attachment-card-tile-editable cursor-pointer outline-none
          focus-visible:ring-2 focus-visible:ring-accent`]: editable,
        }"
        @click="onPreviewClick"
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
          class="size-10 sm:size-11"
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
          class="absolute -right-1 -bottom-1 flex size-6 items-center
            justify-center rounded-full border border-border-1 bg-bg-2 text-xs
            text-text-2 shadow-sm"
          aria-hidden="true"
        >
          <Icon name="edit" />
        </span>
      </component>

      <component
        :is="editable ? 'div' : 'span'"
        class="flex min-w-0 flex-1 flex-col gap-0.5"
      >
        <ContentPlainTextField
          v-if="editable"
          :model-value="title"
          :editable="true"
          :placeholder="fallbackTitle || titlePlaceholder"
          class="min-h-6 truncate font-semibold tracking-tight outline-none
            empty:before:pointer-events-none empty:before:text-text-3
            empty:before:content-[attr(data-placeholder)] focus:before:hidden"
          @update:model-value="emit('title', $event)"
        />
        <span
          v-else
          class="truncate font-semibold tracking-tight transition-colors"
          :class="{ 'group-hocus:text-accent': mode !== 'static' }"
        >
          {{ resolvedTitle }}
        </span>
        <!-- What the file is, for whoever cannot see it: its window shows it. -->
        <span v-if="!editable && asset.alt" class="sr-only">{{
          publicText(asset.alt)
        }}</span>

        <span
          v-if="details.length"
          class="flex min-w-0 items-center gap-1.5 text-xs text-text-3"
        >
          <template v-for="(detail, index) in details" :key="index">
            <span v-if="index" aria-hidden="true">·</span>
            <span class="truncate">{{ detail }}</span>
          </template>
        </span>
      </component>

      <span
        v-if="mode !== 'static'"
        class="flex size-9 shrink-0 items-center justify-center rounded-full
          bg-bg-3 text-text-2 transition-colors group-hocus:bg-accent
          group-hocus:text-white"
        aria-hidden="true"
      >
        <Icon
          :name="
            mode === 'open'
              ? 'expand-diagonal'
              : viewable
                ? 'arrow-outward'
                : 'download'
          "
        />
      </span>
    </component>
    <ContentCaption
      :model-value="caption"
      :editable
      :placeholder="captionPlaceholder"
      @update:model-value="emit('caption', $event)"
    />
  </figure>
</template>

<style scoped>
/*
 * The tints are mixed with the card's own surface rather than laid over it
 * as transparency: the card may lie on a pattern — the locks of a private
 * section — and a translucent tint would let it show through.
 */
.attachment-card-tile {
  background-color: color-mix(
    in oklab,
    var(--color-accent) 10%,
    var(--color-bg-2)
  );
}

.attachment-card-interactive:focus-visible {
  background-color: color-mix(
    in oklab,
    var(--color-accent) 6%,
    var(--color-bg-2)
  );
}

@media (hover: hover) {
  .attachment-card-interactive:hover {
    background-color: color-mix(
      in oklab,
      var(--color-accent) 6%,
      var(--color-bg-2)
    );
  }
}

.attachment-card-interactive:focus-visible .attachment-card-tile,
.attachment-card-tile-editable:focus-visible {
  background-color: color-mix(
    in oklab,
    var(--color-accent) 20%,
    var(--color-bg-2)
  );
}

@media (hover: hover) {
  .attachment-card-interactive:hover .attachment-card-tile,
  .attachment-card-tile-editable:hover {
    background-color: color-mix(
      in oklab,
      var(--color-accent) 20%,
      var(--color-bg-2)
    );
  }
}
</style>
