<script lang="ts" setup>
import type {
  PublicEntityLink,
  PublicEntityReference,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { DateRange } from '#layers/thei/shared/date-range';
import type { IconName } from '#thei/icons';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import {
  datePresentationToneClass,
  publicDatePrecisionLabels,
  type PublicDatePresentation,
} from '#layers/thei/app/composables/public-date';

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
  projects?: PublicEntityLink[];
  /**
   * The project a stage or a section belongs to. Not a relation — a parent —
   * so it sits above the title rather than among the related entities.
   */
  parent?: PublicEntityReference;
  tags?: PublicTagSummary[];
  compact?: boolean;
  continuousMedia?: boolean;
  /**
   * For an entity that has no title: the summary becomes the card's whole
   * copy, set in italics, and there is no heading above it. A diary entry is
   * signed by its date in the line above, so a heading would only repeat it.
   */
  titleless?: boolean;
  /**
   * Draws the card as a thought bubble instead of a box — for a diary entry,
   * which is a thought rather than a thing that happened.
   */
  cloud?: boolean;
  /** Leaves the date out, for a card whose place already dates it. */
  hideDate?: boolean;
  /** Owner-only reminder; a visitor never receives one. */
  reminder?: string;
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
      {
        style: props.compact ? 'short' : 'long',
        precisionLabels: publicDatePrecisionLabels(),
      },
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
const card = useTemplateRef<HTMLElement>('card');
const cloudPath = useCloudOutline(
  computed(() => (props.cloud ? card.value : null)),
  () => props.date,
);
const visibleTags = computed(() => props.tags?.slice(0, 3) ?? []);
const visibleProjects = computed(() => props.projects ?? []);
const hasFooter = computed(
  () => visibleProjects.value.length > 0 || visibleTags.value.length > 0,
);
</script>

<template>
  <article
    ref="card"
    class="public-content-card group relative isolate flex min-w-0 flex-col
      transition"
    :class="[
      compact ? 'min-h-28' : 'min-h-36',
      !cloud &&
        `overflow-hidden rounded-normal border border-border-1 bg-bg-2 shadow-md
        shadow-shadow-1`,
      href &&
        `public-content-card-interactive focus-within:-translate-y-0.5
        hocus:-translate-y-0.5`,
      href &&
        !cloud &&
        `focus-within:border-border-2 focus-within:shadow-xl
        hocus:border-border-2 hocus:shadow-xl`,
    ]"
    :style="cardStyle"
    :data-secret="secret || undefined"
  >
    <!--
      The cloud is drawn rather than bordered: its outline depends on the
      card's size, so it stays hidden until the card has been measured.
    -->
    <svg
      v-if="cloud"
      class="public-cloud pointer-events-none absolute inset-0 -z-1 size-full
        overflow-visible transition"
      :class="cloudPath ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    >
      <path
        :d="cloudPath"
        class="fill-bg-2 stroke-border-1 transition-colors
          group-focus-within:stroke-border-2 group-hover:stroke-border-2"
        stroke-width="1"
        stroke-linejoin="round"
      />
    </svg>
    <TheiLink
      v-if="href"
      :to="href"
      :aria-label="title"
      class="absolute inset-0 z-1 rounded-normal focus-visible:ring-2
        focus-visible:ring-accent focus-visible:ring-inset"
    />

    <div
      v-if="media"
      :class="
        cloud ? ['absolute inset-0', { invisible: !cloudPath }] : 'contents'
      "
      :style="cloud && cloudPath ? { clipPath: `path('${cloudPath}')` } : {}"
    >
      <MediaEdge
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
        <template v-if="!hideDate">
          <TheiLink
            v-if="dateHref"
            :to="dateHref"
            :data-title-popup="datePresentation.title"
            class="pointer-events-auto relative z-3 inline-flex items-center
              gap-1 text-text-3 transition focus-visible:ring-2
              focus-visible:ring-accent hocus:text-accent"
            :class="datePresentationToneClass(datePresentation)"
          >
            <Icon v-if="datePresentation.approximate" name="approximate" />
            {{ datePresentation.label }}
          </TheiLink>
          <time
            v-else
            :datetime="date"
            :data-title-popup="datePresentation.title"
            class="inline-flex items-center gap-1 text-text-3"
            :class="datePresentationToneClass(datePresentation)"
          >
            <Icon v-if="datePresentation.approximate" name="approximate" />
            {{ datePresentation.label }}
          </time>
        </template>
        <Icon
          v-if="reminder"
          name="warning"
          :data-title-popup="`${phrase.entity_reminder_badge}: ${reminder}`"
          :aria-label="phrase.entity_reminder_badge"
          role="img"
          class="pointer-events-auto relative z-3 shrink-0 text-text-warning"
        />
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

      <!--
        One step of `gap-sm` between every piece of data — parent, copy,
        related entities, tags — so none of them reads as glued to its
        neighbour. Only a title and its summary sit closer: they are one unit.
      -->
      <div
        class="public-card-copy flex max-w-4/5 min-w-0 flex-col gap-sm
          sm:max-w-3/4"
        :class="{ 'public-card-copy-over-media': media }"
      >
        <div v-if="parent" class="flex min-w-0 items-center gap-xs text-sm">
          <TheiLink
            :to="parent.href"
            :data-title-popup="parent.summary"
            class="pointer-events-auto relative z-3 inline-flex min-w-0
              items-center gap-xs font-semibold text-text-2 transition
              focus-visible:ring-2 focus-visible:ring-accent
              focus-visible:outline-none hocus:text-accent"
          >
            <BeveledIcon
              :media="parent.iconMedia"
              icon="project"
              class="size-5"
            />
            <span class="min-w-0 truncate">{{ parent.title }}</span>
          </TheiLink>
          <Icon
            name="corner-down"
            class="shrink-0 text-text-3"
            aria-hidden="true"
          />
        </div>
        <p
          v-if="titleless"
          class="public-card-title line-clamp-4 text-base leading-relaxed
            font-medium text-balance text-text-2 italic transition sm:text-lg"
        >
          {{ publicText(summary) }}
        </p>
        <div v-else class="min-w-0">
          <h3
            class="public-card-title text-xl font-bold tracking-tight transition
              sm:text-2xl"
            :class="{ italic: secret }"
          >
            {{ publicText(title) }}
          </h3>
          <p
            v-if="summary"
            class="mt-xs line-clamp-3 text-base leading-relaxed font-semibold
              text-text-2"
          >
            {{ publicText(summary) }}
          </p>
        </div>
      </div>

      <div
        v-if="hasFooter"
        class="flex max-w-4/5 min-w-0 flex-col items-start gap-sm sm:max-w-3/4"
      >
        <PublicEntityLinks :projects="visibleProjects" />
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

/* The box's shadow, redrawn around the cloud's own outline. */
.public-cloud {
  filter: drop-shadow(0 0.2rem 0.3rem var(--color-shadow-1));
}

.public-content-card-interactive:is(:hover, :focus-within) .public-cloud {
  filter: drop-shadow(0 0.6rem 0.9rem var(--public-card-shadow-color));
}

.public-content-card-interactive:hover .public-card-title,
.public-content-card-interactive:focus-within .public-card-title {
  color: var(--public-card-accent-color);
}
</style>
