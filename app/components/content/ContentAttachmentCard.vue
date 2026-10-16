<script lang="ts" setup>
import type { ContentAssetData } from '#layers/thei/shared/content';
import { useContentFileCard } from './content-file-card';

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

const { viewable, mode, resolvedTitle, details, actionIcon } =
  useContentFileCard(props);
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
      <ContentFileTile
        :asset
        :editable
        :edit-label="editLabel"
        @edit="emit('edit')"
      />

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
        <Icon :name="actionIcon" />
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

.attachment-card-interactive:focus-visible .file-tile {
  background-color: color-mix(
    in oklab,
    var(--color-accent) 20%,
    var(--color-bg-2)
  );
}

@media (hover: hover) {
  .attachment-card-interactive:hover .file-tile {
    background-color: color-mix(
      in oklab,
      var(--color-accent) 20%,
      var(--color-bg-2)
    );
  }
}
</style>
