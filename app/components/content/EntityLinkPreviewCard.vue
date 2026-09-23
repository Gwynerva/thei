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
 */
const props = defineProps<{
  entityType: ContentEntityType;
  title: string;
  summary: string;
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
const { engaged, events: mediaEvents } = useMediaInteraction();
const icon = computed(() => entityTypeIcon(props.entityType));
const heading = computed(() => entityDisplayTitle(props));
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
    class="entity-link-preview group relative flex min-h-16 w-full min-w-0
      items-center gap-xs overflow-hidden rounded-normal border border-border-1
      bg-bg-2 text-text-1 no-underline transition-colors"
    :class="[
      {
        'cursor-pointer hocus:border-border-3 hocus:bg-bg-3':
          href && interactive,
      },
      flush ? '' : 'p-xs',
    ]"
  >
    <MediaEdge
      :media="iconMedia"
      side="right"
      fade="preview"
      :engaged
      :playback="playback ?? 'autoplay'"
      :loop
      :autoplay-reduced-motion
      :class="compact ? 'w-24' : 'w-40 sm:w-48'"
    >
      <span class="flex size-full items-center justify-end pr-xs text-text-3">
        <Icon :name="icon" class="entity-type-icon" />
      </span>
    </MediaEdge>
    <span
      class="entity-preview-text relative z-1 min-w-0 flex-1"
      :class="[compact ? 'pr-10' : 'pr-24 sm:pr-36', { 'm-xs': flush }]"
    >
      <span
        v-if="parent"
        class="flex items-center gap-1 truncate text-xs font-semibold
          text-text-3"
        ><Icon name="project" class="entity-type-icon shrink-0" />{{
          parent.title
        }}</span
      >
      <span
        class="flex items-center gap-1 truncate text-sm font-semibold
          sm:text-base"
        ><Icon
          :name="icon"
          class="entity-type-icon shrink-0 text-xs text-text-2"
        />{{ heading }}</span
      >
      <span
        class="line-clamp-2 text-sm text-text-3"
        :class="{ italic: date }"
        >{{ summary }}</span
      >
    </span>
  </component>
</template>

<style scoped>
.entity-link-preview:is(a) {
  text-decoration: none;
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
