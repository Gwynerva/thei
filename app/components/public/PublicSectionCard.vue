<script lang="ts" setup>
import type { PublicProjectSection } from '#layers/thei/shared/api/public';
import { datePresentationToneClass } from '#layers/thei/app/composables/public-date';
import {
  entityCard,
  vEntityCard,
} from '#layers/thei/app/composables/entity-cards';
import TheiLink from '../TheiLink';

/**
 * One section on its project's page: for a stage, the stretch it covers, then
 * its name and what it is about, over its picture, which fills the card from
 * the right edge.
 *
 * Of the same family as a related entity's card, a size larger: the words
 * keep to the left three quarters with a halo of the card's colour, and under
 * the pointer the card lifts and takes its picture's accent. A general
 * section says no date — the day it was written says nothing of it. Resting
 * on it shows the section's card, as a link in a text does.
 */
const { section } = defineProps<{ section: PublicProjectSection }>();

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
</script>

<template>
  <MediaEdgeCard
    :as="TheiLink"
    :to="section.href"
    :media="section.media"
    v-entity-card="
      entityCard('project-section', {
        title: section.title,
        summary: section.summary,
        iconMedia: section.media,
      })
    "
    class="min-h-20 items-center"
    data-section-card
  >
    <!-- The words keep to the left three quarters, clear of where the picture
         stays sharp, and carry a halo where they reach over the rest of it;
         a cut line gets room for its halo, or it draws a seam. -->
    <span
      class="relative z-1 flex max-w-4/5 min-w-0 flex-col gap-0.5 px-sm py-sm
        text-halo-bg-2 sm:max-w-3/4 sm:px-md"
      data-section-text
    >
      <span
        v-if="period"
        class="-mx-[0.75em] truncate px-[0.75em] text-xs text-text-2"
        :class="datePresentationToneClass(period)"
        v-bind="period.title ? titlePopup(...period.title) : undefined"
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
      >
        {{ title }}
      </h3>
      <span
        v-if="summary"
        class="-mx-[0.75em] line-clamp-2 px-[0.75em] text-xs text-text-2
          sm:text-sm"
        >{{ summary }}</span
      >
    </span>
  </MediaEdgeCard>
</template>
