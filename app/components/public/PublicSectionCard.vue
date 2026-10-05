<script lang="ts" setup>
import type { PublicProjectSection } from '#layers/thei/shared/api/public';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import { datePresentationToneClass } from '#layers/thei/app/composables/public-date';

/**
 * One section on its project's page: for a stage, the stretch it covers, then
 * its name and what it is about, over its picture, which fills the card from
 * the right edge.
 *
 * Of the same family as a related entity's card, a size larger: the words
 * keep to the left three quarters with a halo of the card's colour, and under
 * the pointer the card lifts and takes its picture's accent. A general
 * section says no date — the day it was written says nothing of it. Whatever
 * the card cuts short is in its popup in full.
 */
const { section } = defineProps<{ section: PublicProjectSection }>();

const { engaged, events: mediaEvents } = useMediaInteraction();

const accent = computed(() =>
  imageAccentCssColor(section.media?.accent, 'var(--color-accent)'),
);
const title = computed(() => publicText(section.title));
const summary = computed(() => publicText(section.summary));
/** A stage's stretch, with the owner's doubt about it, if any. */
const period = computed(() =>
  section.period
    ? getPublicDatePresentation(
        section.period,
        language.value.code,
        new Date(),
        {
          style: 'abbreviated',
          ...publicDatePrecisionOptions(),
        },
      )
    : undefined,
);

/** Everything the card says, in full, only when the card had to cut it. */
const popup = computed(() => ({
  ...titlePopup(
    period.value && { text: period.value.label },
    { text: title.value, bold: true },
    summary.value && { text: summary.value },
  ),
  'data-title-popup-clipped': '',
}));
</script>

<template>
  <TheiLink
    v-on="mediaEvents"
    :to="section.href"
    v-bind="popup"
    class="section-card group relative isolate flex min-h-20 min-w-0
      items-center overflow-hidden rounded-normal border border-border-1 bg-bg-2
      text-text-1 no-underline shadow-md shadow-shadow-1 transition
      focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none
      hocus:shadow-lg motion-safe:hocus:-translate-y-px"
    :style="{
      '--section-card-accent': accent,
      '--section-card-shadow': `color-mix(in oklab, ${accent} 26%, transparent)`,
    }"
    data-section-card
  >
    <MediaEdge
      :media="section.media"
      side="right"
      fade="card"
      playback="interaction"
      :engaged
      media-class="opacity-75 transition duration-300 group-hocus:opacity-90
        motion-reduce:duration-150"
      class="w-full"
      data-section-media
    />
    <!-- The words keep to the left three quarters, clear of where the picture
         stays sharp, and carry a halo where they reach over the rest of it;
         a cut line gets room for its halo, or it draws a seam. -->
    <span
      class="section-card-text relative z-1 flex max-w-4/5 min-w-0 flex-col
        gap-0.5 px-sm py-sm sm:max-w-3/4 sm:px-md"
      data-section-text
    >
      <span
        v-if="period"
        class="-mx-[0.75em] truncate px-[0.75em] text-xs text-text-2"
        :class="datePresentationToneClass(period)"
        v-bind="period.title ? titlePopup(...period.title) : undefined"
        data-title-popup-clip
        data-section-period
        ><Icon
          v-if="period.approximate"
          name="approximate"
          class="mr-0.5"
          aria-hidden="true"
        />{{ period.label }}</span
      >
      <h3
        class="-mx-[0.75em] line-clamp-2 px-[0.75em] text-sm leading-snug
          font-semibold transition-colors group-hocus:text-accent sm:text-base"
        data-title-popup-clip
      >
        {{ title }}
      </h3>
      <span
        v-if="summary"
        class="-mx-[0.75em] line-clamp-2 px-[0.75em] text-xs text-text-2
          sm:text-sm"
        data-title-popup-clip
        >{{ summary }}</span
      >
    </span>
  </TheiLink>
</template>

<style scoped>
.section-card-text {
  text-shadow:
    0 0 0.55em var(--color-bg-2),
    0 0 0.9em var(--color-bg-2),
    0 0.1em 0.45em var(--color-bg-2);
}

.section-card:focus-visible {
  border-color: var(--section-card-accent);
  --tw-shadow-color: var(--section-card-shadow);
}

@media (hover: hover) {
  .section-card:hover {
    border-color: var(--section-card-accent);
    --tw-shadow-color: var(--section-card-shadow);
  }
}
</style>
