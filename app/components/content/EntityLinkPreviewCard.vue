<script lang="ts" setup>
import type { MediaDescriptor, MediaPlayback } from '#layers/thei/shared/media';
import type { ContentEntityType } from '#layers/thei/shared/content-link';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

/**
 * The card a link to one of the site's own entities is shown as — a link
 * block in content, or the popup over an inline link.
 *
 * Every kind gets the same card and says what it is with its glyph. A stage
 * or a section also names its project above its title, since "Launch" alone
 * does not say whose launch it was; a diary entry is titled by its day and
 * quotes its opening lines in italics, as its own card on the timeline does.
 * A target with a picture of its own shows it along the right edge. The
 * owner's note on the link comes last (`note`, or the `note` slot).
 */
const props = defineProps<{
  entityType: ContentEntityType;
  title: string;
  summary: string;
  /** The owner's note, as typed. */
  note?: string;
  /** The day of a diary entry; formatted in place of the title. */
  date?: string;
  /** The project a stage or a section belongs to. */
  parent?: { title: string; href: string };
  iconMedia?: MediaDescriptor;
  href?: string;
  interactive: boolean;
  playback?: MediaPlayback;
  flush?: boolean;
  /** For a narrow popup: a thinner picture, so the text keeps its room. */
  compact?: boolean;
  loop?: boolean;
  autoplayReducedMotion?: boolean;
}>();
defineSlots<{ note?(): unknown }>();
const { engaged, events: mediaEvents } = useMediaInteraction();
const icon = computed(() => entityTypeIcon(props.entityType));
const heading = computed(() => publicText(entityDisplayTitle(props)));
</script>

<template>
  <component
    v-on="mediaEvents"
    :is="href && interactive ? 'a' : 'div'"
    :href="href && interactive ? href : undefined"
    :tabindex="
      playback === 'interaction' && !(href && interactive) ? 0 : undefined
    "
    :target="href && interactive ? '_blank' : undefined"
    :rel="href && interactive ? 'noopener noreferrer' : undefined"
    class="entity-link-preview group relative flex w-full min-w-0 items-center
      gap-xs overflow-hidden rounded-normal border border-border-1 bg-bg-2
      text-text-1 no-underline transition-colors"
    :class="[
      { 'entity-link-preview-interactive cursor-pointer': href && interactive },
      compact ? 'min-h-16' : 'min-h-18',
      flush ? '' : compact ? 'px-sm py-xs' : 'p-sm',
    ]"
  >
    <MediaEdge
      v-if="iconMedia"
      :media="iconMedia"
      side="right"
      fade="preview"
      :engaged
      :playback="playback ?? 'autoplay'"
      :loop
      :autoplay-reduced-motion
      :class="compact ? 'w-1/2 max-w-40' : 'w-3/4 max-w-72'"
    />
    <!--
      The words keep clear of the window where the picture stays sharp and
      read over the rest of it; both scale with the card, so a narrow column
      does not give the picture the room the title needs. A truncated line
      clips its own halo, which draws a hard seam across the picture, so it
      gets room for the halo all round.
    -->
    <span
      class="entity-preview-text relative z-1 flex min-w-0 flex-1 flex-col"
      :class="[
        compact ? 'gap-0.5' : 'gap-1',
        iconMedia
          ? compact
            ? 'pr-[min(18%,3rem)]'
            : 'pr-[min(24%,6rem)]'
          : '',
        { 'm-xs': flush },
      ]"
    >
      <span
        v-if="parent"
        class="flex min-w-0 items-center gap-1 text-xs font-semibold
          text-text-3"
        ><Icon name="project" class="entity-type-icon shrink-0" /><span
          class="-m-[0.75em] min-w-0 truncate p-[0.75em]"
          >{{ publicText(parent.title) }}</span
        ><Icon name="corner-down" class="shrink-0" aria-hidden="true"
      /></span>
      <span
        class="flex min-w-0 items-center font-semibold"
        :class="compact ? 'gap-1 text-sm' : 'gap-1.5 text-base'"
        ><Icon
          :name="icon"
          class="entity-type-icon shrink-0 text-text-2"
          :class="compact ? 'text-xs' : 'text-base'"
        /><span class="-m-[0.75em] min-w-0 truncate p-[0.75em]">{{
          heading
        }}</span></span
      >
      <span
        v-if="summary"
        class="-mx-[0.75em] line-clamp-2 px-[0.75em] text-text-3"
        :class="[
          compact ? 'text-sm' : 'text-[0.9375rem] leading-snug',
          { italic: date },
        ]"
        >{{ publicText(summary) }}</span
      >
      <span v-if="$slots.note || note" class="mt-0.5 block text-sm">
        <slot name="note"><ContentLinkNote :note /></slot>
      </span>
    </span>
  </component>
</template>

<style scoped>
.entity-link-preview:is(a) {
  text-decoration: none;
}

.entity-link-preview-interactive:is(:hover, :focus-visible) {
  border-color: color-mix(
    in oklab,
    var(--color-accent) 40%,
    var(--color-border-1)
  );
  background-color: color-mix(
    in oklab,
    var(--color-accent) 8%,
    var(--color-bg-2)
  );
}

.entity-preview-text {
  text-shadow:
    0 0 0.5em var(--color-bg-2),
    0 0 0.9em var(--color-bg-2),
    0 0.12em 0.45em var(--color-bg-2);
}

.entity-type-icon {
  filter: drop-shadow(0 0 0.3em var(--color-bg-2))
    drop-shadow(0 0.08em 0.24em var(--color-bg-2));
}
</style>
