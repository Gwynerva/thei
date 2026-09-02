<script lang="ts" setup>
import type {
  PublicProjectReference,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { DateRange } from '#layers/thei/shared/date-range';
import type { IconName } from '#thei/icons';
import { accentHueCssColor } from '#layers/thei/shared/accent-color';

const props = defineProps<{
  href: string;
  title: string;
  summary: string;
  label?: string;
  icon?: IconName;
  date: string;
  period?: DateRange;
  dateHref?: string;
  media?: MediaDescriptor;
  projects?: PublicProjectReference[];
  tags?: PublicTagSummary[];
  compact?: boolean;
}>();

const datePresentation = computed(() =>
  getPublicDatePresentation(props.period ?? props.date, language.value.code),
);
const cardStyle = computed<Record<string, string>>(() => {
  const accentColor =
    props.media?.accentHue === undefined
      ? 'var(--color-accent)'
      : accentHueCssColor(props.media.accentHue, 'var(--color-accent)');

  return {
    '--public-card-accent-color': accentColor,
    '--public-card-shadow-color':
      props.media?.accentHue === undefined
        ? 'color-mix(in oklab, var(--color-accent) 32%, transparent)'
        : accentHueCssColor(props.media.accentHue, 'var(--color-accent)', 0.32),
  };
});
const visibleTags = computed(() => props.tags?.slice(0, 3) ?? []);
const visibleProjects = computed(() => props.projects ?? []);
const hasFooter = computed(
  () => visibleProjects.value.length > 0 || visibleTags.value.length > 0,
);
</script>

<template>
  <article
    class="public-content-card group relative isolate flex min-w-0 flex-col
      overflow-hidden rounded-normal border border-border-1 bg-bg-2 shadow-md
      shadow-shadow-1 transition focus-within:-translate-y-0.5
      focus-within:border-border-2 focus-within:shadow-xl hocus:-translate-y-0.5
      hocus:border-border-2 hocus:shadow-xl"
    :class="compact ? 'min-h-28' : 'min-h-36'"
    :style="cardStyle"
  >
    <TheiLink
      :to="href"
      :aria-label="title"
      class="absolute inset-0 z-1 rounded-normal focus-visible:ring-2
        focus-visible:ring-accent focus-visible:ring-inset"
    />

    <div
      v-if="media"
      class="public-card-media pointer-events-none absolute inset-y-0 right-0
        w-3/5 bg-bg-accent sm:w-1/2"
      aria-hidden="true"
    >
      <Media
        v-bind="media"
        class="size-full opacity-70 transition duration-300
          group-hocus:opacity-95 motion-reduce:duration-150"
      />
    </div>

    <div
      class="pointer-events-none relative z-2 flex min-h-full flex-1 flex-col
        gap-sm"
      :class="compact ? 'p-sm sm:p-md' : 'p-md'"
    >
      <div
        class="flex max-w-4/5 flex-wrap items-center gap-x-2 gap-y-1 text-xs
          font-semibold text-accent sm:max-w-3/4"
      >
        <span v-if="label" class="flex items-center gap-2 opacity-55">
          <Icon v-if="icon" :name="icon" class="shrink-0" />
          <span>{{ label }}</span>
        </span>
        <TheiLink
          v-if="dateHref"
          :to="dateHref"
          :data-title-popup="datePresentation.title"
          class="pointer-events-auto relative z-3 text-text-3 transition
            focus-visible:ring-2 focus-visible:ring-accent hocus:text-accent"
        >
          {{ datePresentation.label }}
        </TheiLink>
        <time
          v-else
          :datetime="date"
          :data-title-popup="datePresentation.title"
          class="text-text-3"
        >
          {{ datePresentation.label }}
        </time>
      </div>

      <div
        class="public-card-copy max-w-4/5 min-w-0 sm:max-w-3/4"
        :class="{ 'public-card-copy-over-media': media }"
      >
        <h3
          class="public-card-title text-xl font-bold tracking-tight transition
            sm:text-2xl"
        >
          {{ title }}
        </h3>
        <p
          v-if="summary"
          class="mt-2 line-clamp-3 text-base leading-relaxed font-semibold
            text-text-2"
        >
          {{ summary }}
        </p>
      </div>

      <div
        v-if="hasFooter"
        class="flex max-w-4/5 min-w-0 flex-col items-start gap-sm sm:max-w-3/4"
      >
        <PublicProjectLinks :projects="visibleProjects" />
        <PublicTagLinks :tags="visibleTags" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.public-card-media {
  mask-image: linear-gradient(
    to right,
    transparent 0%,
    rgb(0 0 0 / 12%) 24%,
    rgb(0 0 0 / 72%) 62%,
    black 100%
  );
}

.public-card-copy-over-media {
  text-shadow:
    0 0 0.55em var(--color-bg-2),
    0 0 0.9em var(--color-bg-2),
    0 0.1em 0.45em var(--color-bg-2);
}

.public-content-card:hover,
.public-content-card:focus-within {
  --tw-shadow-color: var(--public-card-shadow-color);
}

.public-content-card:hover .public-card-title,
.public-content-card:focus-within .public-card-title {
  color: var(--public-card-accent-color);
}
</style>
