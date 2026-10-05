<script lang="ts" setup>
import type { Period } from '#layers/thei/shared/period';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import DateRangeChip from '#layers/thei/app/components/DateRangeChip.vue';

/**
 * One section in the project form: its name, with a lock before it when only
 * the owner sees it, what it is about, and the stretches a dated one covers,
 * over the first picture of its body, which fills the row from the right
 * edge as on every card of the site.
 *
 * A row of a list that is dragged into order has its grip along the whole
 * left edge — pale until the pointer comes near, so that the rows read as
 * sections rather than as controls. Removing a section is left to its modal:
 * it takes the section's text and files with it.
 *
 * The row is itself what a drag sort moves, so it eases its colours only: a
 * transition of `transform` would swallow the sort's own slide of the rows
 * making way.
 */
const { title, summary, periods, media, isPrivate, sortable } = defineProps<{
  title: string;
  summary: string;
  periods: Period[];
  media?: MediaDescriptor;
  isPrivate: boolean;
  /** Dragged into order, with a grip; a dated section keeps its time order. */
  sortable: boolean;
}>();
defineEmits<{ open: []; move: [direction: -1 | 1] }>();

const { engaged, events: mediaEvents } = useMediaInteraction();

const accent = computed(() =>
  imageAccentCssColor(media?.accent, 'var(--color-accent)'),
);
</script>

<template>
  <div
    v-on="mediaEvents"
    class="section-row group relative isolate flex min-h-16 items-stretch
      overflow-hidden rounded-normal border border-border-1 bg-bg-3
      transition-colors"
    :style="{ '--section-accent': accent }"
    data-section-row
  >
    <MediaEdge
      v-if="media"
      :media
      side="right"
      fade="card"
      playback="interaction"
      :engaged
      media-class="opacity-75 transition duration-300 group-hover:opacity-90
        group-has-focus-visible:opacity-90 motion-reduce:duration-150"
      class="w-full"
      data-section-media
    />
    <button
      v-if="sortable"
      type="button"
      class="relative z-1 flex w-7 shrink-0 cursor-grab items-center
        justify-center self-stretch text-lg text-text-3/50 transition-colors
        group-hover:text-text-3 focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none focus-visible:ring-inset
        active:cursor-grabbing hocus:text-accent"
      :aria-label="`${phrase.content_section_sort}: ${publicText(title)}`"
      data-content-section-handle
      @keydown.up.prevent.stop="$emit('move', -1)"
      @keydown.down.prevent.stop="$emit('move', 1)"
    >
      <Icon name="grip" />
    </button>
    <button
      type="button"
      class="relative z-1 flex min-w-0 flex-1 cursor-pointer flex-col
        justify-center py-sm pr-sm text-left focus-visible:outline-none"
      :class="sortable ? undefined : 'pl-sm sm:pl-md'"
      data-section-open
      @click="$emit('open')"
    >
      <!-- The words keep to the left of where the picture stays sharp, with
           a halo of the row's ground where they reach over the rest of it. -->
      <span
        class="section-row-text flex min-w-0 flex-col gap-1"
        :class="media ? 'max-w-4/5 sm:max-w-3/4' : undefined"
      >
        <span
          class="line-clamp-2 leading-snug font-semibold wrap-break-word
            transition-colors group-hocus:text-accent"
          data-section-title
          ><span
            v-if="isPrivate"
            class="mr-1 text-accent"
            :data-title-popup="phrase.content_section_private"
            data-section-private
            ><Icon name="lock-close" aria-hidden="true" /><span class="sr-only"
              >{{ phrase.content_section_private }}:
            </span></span
          >{{ publicText(title) }}</span
        >
        <span
          v-if="summary"
          class="line-clamp-2 text-sm wrap-break-word text-text-2"
        >
          {{ publicText(summary) }}
        </span>
        <!-- The chips have a ground of their own: no halo inside them. -->
        <span
          v-if="periods.length"
          class="mt-1.5 flex flex-wrap gap-1 text-shadow-none"
        >
          <DateRangeChip
            v-for="period in periods"
            :key="`${period.startDate}:${period.endDate}:${period.label}`"
            :period="period"
          />
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.section-row-text {
  text-shadow:
    0 0 0.5em var(--color-bg-3),
    0 0 0.9em var(--color-bg-3),
    0 0.12em 0.45em var(--color-bg-3);
}

.section-row:has(:focus-visible) {
  border-color: color-mix(in oklab, var(--section-accent) 80%, transparent);
}

@media (hover: hover) {
  .section-row:hover {
    border-color: color-mix(in oklab, var(--section-accent) 80%, transparent);
  }
}
</style>
