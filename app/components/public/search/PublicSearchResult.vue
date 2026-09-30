<script lang="ts" setup>
import type { PublicEntitySummary } from '#layers/thei/shared/api/public';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

const props = defineProps<{ entity: PublicEntitySummary }>();
const { engaged, events: mediaEvents } = useMediaInteraction();
const isProject = computed(() => props.entity.type === 'project');
const accent = computed(() =>
  props.entity.media
    ? imageAccentCssColor(props.entity.media.accent)
    : 'var(--color-accent)',
);
</script>

<template>
  <article
    v-on="mediaEvents"
    class="search-result group relative isolate flex min-h-24 min-w-0
      overflow-hidden rounded-normal border border-border-1 bg-bg-2 shadow-md
      shadow-shadow-1 transition focus-within:-translate-y-px
      focus-within:shadow-lg hocus:-translate-y-px hocus:shadow-lg"
    :style="{
      '--search-result-accent': accent,
      '--search-result-shadow': `color-mix(in oklab, ${accent} 26%, transparent)`,
    }"
  >
    <TheiLink
      :to="entity.href"
      :aria-label="publicText(entity.title)"
      class="absolute inset-0 z-1 rounded-normal focus-visible:ring-2
        focus-visible:ring-accent focus-visible:ring-inset"
    />
    <MediaEdge
      :media="entity.media"
      side="right"
      fade="card"
      playback="interaction"
      :engaged
      :loop="isProject"
      :muted="isProject"
      media-class="opacity-75 transition duration-300 group-hocus:opacity-90
        group-focus-within:opacity-90 motion-reduce:duration-150"
      class="w-full"
    >
      <span
        class="flex size-full items-center justify-end pr-md text-6xl
          text-text-3/25"
      >
        <Icon :name="entity.type" />
      </span>
    </MediaEdge>
    <div
      class="pointer-events-none relative z-2 flex max-w-4/5 min-w-0 flex-col
        justify-center gap-1 p-sm sm:max-w-3/4 sm:px-md"
      :class="{ 'search-result-over-media': entity.media }"
    >
      <span
        class="flex items-center gap-2 text-xs font-semibold text-accent/70"
      >
        <Icon :name="entity.type" class="shrink-0" />
        <span>{{ isProject ? phrase.project : phrase.event }}</span>
        <Icon
          v-if="entity.showcase"
          name="star"
          :aria-label="phrase.showcase"
          role="img"
          class="pointer-events-auto relative z-3 shrink-0 cursor-help"
          :data-title-popup="phrase.showcase"
        />
        <Icon
          v-if="entity.reminder"
          name="warning"
          :aria-label="phrase.entity_reminder_badge"
          role="img"
          class="pointer-events-auto relative z-3 shrink-0 cursor-help
            text-text-warning"
          v-bind="
            reminderTitlePopup(
              phrase.entity_reminder_badge,
              publicText(entity.reminder),
            )
          "
        />
        <Icon
          v-if="entity.cv"
          name="case-important"
          :aria-label="phrase.cv_project_label"
          role="img"
          class="pointer-events-auto relative z-3 shrink-0 cursor-help"
          :data-title-popup="phrase.cv_project_label"
        />
      </span>
      <h2
        class="search-result-title text-lg leading-snug font-bold tracking-tight
          wrap-break-word transition"
      >
        {{ publicText(entity.title) }}
      </h2>
      <!-- Room for the halo on either side: clamping clips it otherwise, and
           a clipped halo draws a hard seam across the media. -->
      <p
        v-if="entity.summary"
        class="-mx-[0.75em] line-clamp-2 px-[0.75em] text-sm leading-relaxed
          font-semibold text-text-2"
      >
        {{ publicText(entity.summary) }}
      </p>
    </div>
  </article>
</template>

<style scoped>
/*
 * The same treatment the cards on "Life" get, in smaller measure: results sit
 * closer together here, so the lift is a single pixel and the glow is fainter.
 */
.search-result:hover,
.search-result:focus-within {
  border-color: var(--search-result-accent);
  --tw-shadow-color: var(--search-result-shadow);
}

/* The media reaches under the text; a halo of the card's colour keeps it read. */
.search-result-over-media {
  text-shadow:
    0 0 0.55em var(--color-bg-2),
    0 0 0.9em var(--color-bg-2),
    0 0.1em 0.45em var(--color-bg-2);
}

.group:hover .search-result-title,
.group:focus-within .search-result-title {
  color: var(--search-result-accent);
}
</style>
