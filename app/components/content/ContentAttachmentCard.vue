<script lang="ts" setup>
import {
  contentFileEmits,
  contentFileProps,
  useContentFileCard,
} from './content-file-card';

/**
 * A file alone in a text, as a card: its square, its title and its facts,
 * the whole card opening the file; the caption under it.
 */
const props = defineProps(contentFileProps);

const emit = defineEmits(contentFileEmits);

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
      :data-opens-viewer="mode === 'open' ? '' : undefined"
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
        <ContentFileWords
          :title
          :editable
          :placeholder="fallbackTitle || titlePlaceholder"
          :alt="asset.alt"
          :details
          @title="emit('title', $event)"
        >
          <span
            class="truncate font-semibold tracking-tight transition-colors"
            :class="{ 'group-hocus:text-accent': mode !== 'static' }"
          >
            {{ resolvedTitle }}
          </span>
        </ContentFileWords>
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
