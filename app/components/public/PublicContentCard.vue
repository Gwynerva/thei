<script lang="ts" setup>
import type {
  PublicProjectLink,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { DateRange } from '#layers/thei/shared/date-range';
import type { IconName } from '#thei/icons';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import type { PublicDatePresentation } from '#layers/thei/app/composables/public-date';

const props = defineProps<{
  /** Absent for a secret, which a visitor cannot open. */
  href?: string;
  title: string;
  summary: string;
  label?: string;
  icon?: IconName;
  date: string;
  period?: DateRange;
  dateHref?: string;
  datePresentation?: PublicDatePresentation;
  media?: MediaDescriptor;
  projects?: PublicProjectLink[];
  tags?: PublicTagSummary[];
  compact?: boolean;
  continuousMedia?: boolean;
  /** Presents a codename for something hidden from visitors. */
  secret?: boolean;
}>();

const datePresentation = computed(
  () =>
    props.datePresentation ??
    getPublicDatePresentation(
      props.period ?? props.date,
      language.value.code,
      new Date(),
      { style: props.compact ? 'short' : 'long' },
    ),
);
const cardStyle = computed<Record<string, string>>(() => {
  const accentColor = props.media
    ? imageAccentCssColor(props.media.accent)
    : 'var(--color-accent)';

  return {
    '--public-card-accent-color': accentColor,
    '--public-card-shadow-color': `color-mix(in oklab, ${accentColor} 32%, transparent)`,
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
      shadow-shadow-1 transition"
    :class="[
      compact ? 'min-h-28' : 'min-h-36',
      href &&
        `public-content-card-interactive focus-within:-translate-y-0.5
        focus-within:border-border-2 focus-within:shadow-xl
        hocus:-translate-y-0.5 hocus:border-border-2 hocus:shadow-xl`,
    ]"
    :style="cardStyle"
    :data-secret="secret || undefined"
  >
    <TheiLink
      v-if="href"
      :to="href"
      :aria-label="title"
      class="absolute inset-0 z-1 rounded-normal focus-visible:ring-2
        focus-visible:ring-accent focus-visible:ring-inset"
    />

    <MediaEdge
      v-if="media"
      :media
      side="right"
      fade="card"
      playback="autoplay"
      :autoplay-reduced-motion="continuousMedia"
      :loop="continuousMedia"
      :muted="continuousMedia"
      media-class="opacity-70 transition duration-300 group-hocus:opacity-95
        motion-reduce:duration-150"
      class="w-3/5 sm:w-1/2"
    />

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
        <Icon
          v-if="secret"
          name="lock-close"
          :data-title-popup="phrase.secret_hint"
          :aria-label="phrase.secret_hint"
          role="img"
          class="pointer-events-auto relative z-3 shrink-0 text-text-3
            opacity-60"
        />
      </div>

      <div
        class="public-card-copy max-w-4/5 min-w-0 sm:max-w-3/4"
        :class="{ 'public-card-copy-over-media': media }"
      >
        <h3
          class="public-card-title text-xl font-bold tracking-tight transition
            sm:text-2xl"
          :class="{ italic: secret }"
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
.public-card-copy-over-media {
  text-shadow:
    0 0 0.55em var(--color-bg-2),
    0 0 0.9em var(--color-bg-2),
    0 0.1em 0.45em var(--color-bg-2);
}

.public-content-card-interactive:hover,
.public-content-card-interactive:focus-within {
  --tw-shadow-color: var(--public-card-shadow-color);
}

.public-content-card-interactive:hover .public-card-title,
.public-content-card-interactive:focus-within .public-card-title {
  color: var(--public-card-accent-color);
}
</style>
