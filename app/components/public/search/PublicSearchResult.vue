<script lang="ts" setup>
import type { PublicEntitySummary } from '#layers/thei/shared/api/public';

/**
 * A project or an event in the results of a search: the card is no link
 * itself, so the badges on it keep their own hints; a link lies over the
 * whole of it. Results sit close together, so the lift is a single pixel.
 */
const props = defineProps<{ entity: PublicEntitySummary }>();
const isProject = computed(() => props.entity.type === 'project');
</script>

<template>
  <MediaEdgeCard
    as="article"
    :media="entity.media"
    :loop="isProject"
    :muted="isProject"
    class="min-h-24"
  >
    <TheiLink
      :to="entity.href"
      :aria-label="publicText(entity.title)"
      class="absolute inset-0 z-1 rounded-normal focus-visible:ring-2
        focus-visible:ring-accent focus-visible:ring-inset"
    />
    <template #fallback>
      <span
        class="flex size-full items-center justify-end pr-md text-6xl
          text-text-3/25"
      >
        <Icon :name="entity.type" />
      </span>
    </template>
    <div
      class="pointer-events-none relative z-2 flex max-w-4/5 min-w-0 flex-col
        justify-center gap-1 p-sm sm:max-w-3/4 sm:px-md"
      :class="{ 'text-halo-bg-2': entity.media }"
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
        class="text-lg leading-snug font-bold tracking-tight wrap-break-word
          transition group-has-focus-visible:text-(--card-accent)
          group-hocus:text-(--card-accent)"
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
  </MediaEdgeCard>
</template>
