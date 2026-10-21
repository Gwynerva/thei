<script lang="ts" setup>
import {
  contentFileEmits,
  contentFileProps,
  useContentFileCard,
} from './content-file-card';

/**
 * A file as a row of a group's list: its square, then its title, its facts
 * and its caption one under another, the list drawing the frame around.
 *
 * The whole row opens the file, by the title's link stretched over it; the
 * caption lies above that, and its own links stay links, while a press on
 * its words goes through to the file.
 */
const props = defineProps(contentFileProps);

const emit = defineEmits(contentFileEmits);

const { viewable, mode, resolvedTitle, details, actionIcon } =
  useContentFileCard(props);
</script>

<template>
  <figure
    class="file-row group relative flex min-w-0 items-start gap-sm p-xs
      text-text-1 transition-colors sm:pr-sm"
    :class="{ 'file-row-interactive': mode !== 'static' }"
    data-content-attachment
  >
    <ContentFileTile
      :asset
      :editable
      :edit-label="editLabel"
      small
      @edit="emit('edit')"
    />

    <div class="flex min-h-12 min-w-0 flex-1 flex-col justify-center gap-0.5">
      <ContentFileWords
        :title
        :editable
        :placeholder="fallbackTitle || titlePlaceholder"
        :alt="asset.alt"
        :details
        @title="emit('title', $event)"
      >
        <component
          :is="mode === 'open' ? 'button' : mode === 'link' ? 'a' : 'span'"
          :type="mode === 'open' ? 'button' : undefined"
          :href="mode === 'link' ? sitePath(href) : undefined"
          :target="mode === 'link' && viewable ? '_blank' : undefined"
          :rel="mode === 'link' ? 'noopener noreferrer' : undefined"
          :download="mode === 'link' && !viewable ? '' : undefined"
          :data-opens-viewer="mode === 'open' ? '' : undefined"
          class="truncate text-left font-semibold tracking-tight text-text-1
            no-underline transition-colors outline-none"
          :class="
            mode !== 'static' &&
            `cursor-pointer group-hocus:text-accent after:absolute after:inset-0
            focus-visible:after:ring-2 focus-visible:after:ring-accent
            focus-visible:after:ring-inset`
          "
          @click="mode === 'open' ? emit('open') : undefined"
        >
          {{ resolvedTitle }}
        </component>
      </ContentFileWords>

      <ContentCaption
        :model-value="caption"
        :editable
        :placeholder="captionPlaceholder"
        class="file-row-caption"
        @update:model-value="emit('caption', $event)"
      />
    </div>

    <span
      v-if="mode !== 'static'"
      class="mt-2 flex size-8 shrink-0 items-center justify-center rounded-full
        bg-bg-3 text-text-2 transition-colors group-hocus:bg-accent
        group-hocus:text-white"
      aria-hidden="true"
    >
      <Icon :name="actionIcon" />
    </span>
  </figure>
</template>

<style scoped>
/* Close under the facts, as a line of the row rather than a block of its own. */
.file-row-caption {
  margin-top: 0;
}

/*
 * Above the link stretched over the row: its own links stay links, and a
 * press on its words goes through to the file.
 */
.file-row-interactive .file-row-caption {
  position: relative;
  pointer-events: none;
}

.file-row-interactive .file-row-caption :deep(a) {
  pointer-events: auto;
}

/*
 * The tints are mixed with the list's own surface rather than laid over it
 * as transparency: the list may lie on a pattern — the locks of a private
 * section — and a translucent tint would let it show through.
 */
.file-row-interactive:has(:focus-visible) {
  background-color: color-mix(
    in oklab,
    var(--color-accent) 6%,
    var(--color-bg-2)
  );
}

@media (hover: hover) {
  .file-row-interactive:hover {
    background-color: color-mix(
      in oklab,
      var(--color-accent) 6%,
      var(--color-bg-2)
    );
  }

  .file-row-interactive:hover .file-tile {
    background-color: color-mix(
      in oklab,
      var(--color-accent) 20%,
      var(--color-bg-2)
    );
  }
}
</style>
