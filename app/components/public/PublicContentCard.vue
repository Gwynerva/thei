<script lang="ts" setup>
import type {
  PublicEntityLink,
  PublicEntityReference,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { DateRange } from '#layers/thei/shared/date-range';
import type { IconName } from '#thei/icons';
import type { PublicPeriodMark } from '#layers/thei/shared/public-timeline';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import {
  continuationOutlinePath,
  tornStripOutlinePath,
} from '#layers/thei/shared/continuation-outline';
import type { RelationType } from '#layers/thei/shared/relation';
import type { LifeExcerptName } from '#layers/thei/shared/life';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';
import {
  boxRadius,
  useMeasuredOutline,
} from '#layers/thei/app/composables/cloud-outline';
import {
  datePresentationToneClass,
  publicDatePrecisionOptions,
  type PublicDatePresentation,
} from '#layers/thei/app/composables/public-date';

const props = defineProps<{
  /** Absent for a secret, which a visitor cannot open. */
  href?: string;
  title: string;
  summary: string;
  label?: string;
  icon?: IconName;
  /**
   * Marks the label as a moment of a period — its start, end, day, whole
   * stretch, or a start still running — beside the icon, if any.
   */
  mark?: PublicPeriodMark;
  /**
   * Says what the mark stands for — "An event started" — on hover over it
   * and to assistive technology.
   */
  labelHint?: string;
  /** The label is the period's own name rather than a word for its kind. */
  labelNamed?: boolean;
  date: string;
  period?: DateRange;
  dateHref?: string;
  datePresentation?: PublicDatePresentation;
  media?: MediaDescriptor;
  projects?: PublicEntityLink[];
  /**
   * The project a section belongs to. Not a relation — a parent —
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
   * which is a thought rather than a thing that happened. Its date picks
   * one of several clouds, so a feed of entries is not one shape repeated.
   */
  cloud?: boolean;
  /** Leaves the date out, for a card whose place already dates it. */
  hideDate?: boolean;
  /** Owner-only reminder; a visitor never receives one. */
  reminder?: string;
  /** Presents a codename for something hidden from visitors. */
  secret?: boolean;
  /**
   * The card is one end of a period that goes on beyond it: up, for a start
   * whose period runs on to a newer day, or down, for an end whose period
   * began on an older one. The edge on that side says so.
   */
  continues?: 'up' | 'down';
  /**
   * The card is an excerpt: a strip torn off above and below, with big
   * regular teeth, cut out of a longer text. Never with `continues` or
   * `cloud`.
   */
  torn?: boolean;
  /**
   * How the card's subject relates to the page it is on, under its words:
   * the relation's word when it has a direction, and the owner's reason.
   */
  relation?: { type: RelationType; note?: string };
  /**
   * The excerpts of an entry or an event, named under its words on the
   * Life, each leading to its own page.
   */
  parts?: LifeExcerptName[];
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
        ...publicDatePrecisionOptions(),
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
/**
 * A start or an end of a period, torn on the side its period goes on to.
 * Until the card is measured it is an ordinary box, so the first paint
 * already has its border and shade; the drawn outline takes over as soon as
 * it can.
 */
const continuationPath = useMeasuredOutline(
  computed(() =>
    (props.continues || props.torn) && !props.cloud ? card.value : null,
  ),
  (width, height) =>
    props.torn
      ? tornStripOutlinePath(width, height)
      : props.continues
        ? continuationOutlinePath(width, height, props.continues, boxRadius())
        : '',
);
const outlinePath = computed(() =>
  props.cloud ? cloudPath.value : continuationPath.value,
);
/** Whether the card is drawn by an outline rather than bordered as a box. */
const drawn = computed(
  () => props.cloud || props.torn || Boolean(continuationPath.value),
);
const relationText = computed(() =>
  props.relation?.note ? publicText(props.relation.note) : '',
);
/** A plain "related" with no reason says nothing the card's place does not. */
const showsRelation = computed(
  () =>
    !props.parent &&
    Boolean(props.relation) &&
    (props.relation!.type !== 'related' || Boolean(relationText.value)),
);
/**
 * Whether the card has any copy to show. An entry with no text of its own
 * has no lead, and one whose excerpts the reader is not shown has none of
 * those either.
 */
const hasCopy = computed(
  () =>
    Boolean(props.parent) ||
    !props.titleless ||
    Boolean(props.summary) ||
    showsRelation.value ||
    Boolean(props.parts?.length),
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
      !drawn &&
        `overflow-hidden rounded-normal border border-border-1 bg-bg-2 shadow-md
        shadow-shadow-1`,
      href &&
        `public-content-card-interactive has-focus-visible:-translate-y-0.5
        hocus:-translate-y-0.5`,
      href &&
        !drawn &&
        `has-focus-visible:border-border-2 has-focus-visible:shadow-xl
        hocus:border-border-2 hocus:shadow-xl`,
    ]"
    :style="cardStyle"
    :data-secret="secret || undefined"
    :data-continues="continues"
    :data-torn="torn || undefined"
  >
    <!--
      A cloud, or the torn edge of a period's start or end, is drawn rather
      than bordered: its outline depends on the card's size, so a cloud stays
      hidden until the card has been measured.
    -->
    <svg
      v-if="cloud || torn || continuationPath"
      class="public-outline pointer-events-none absolute inset-0 -z-1 size-full
        overflow-visible transition"
      :class="outlinePath ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    >
      <path
        :d="outlinePath"
        class="fill-bg-2 stroke-border-1 transition-colors
          group-hover:stroke-border-2 group-has-focus-visible:stroke-border-2"
        stroke-width="1"
        stroke-linejoin="round"
      />
    </svg>
    <TheiLink
      v-if="href"
      :to="href"
      :aria-label="
        titleless ? entityListName({ title, date }) : publicText(title)
      "
      class="absolute inset-0 z-1 rounded-normal focus-visible:ring-2
        focus-visible:ring-accent focus-visible:ring-inset"
    />

    <div
      v-if="media"
      :class="
        drawn ? ['absolute inset-0', { invisible: !outlinePath }] : 'contents'
      "
      :style="
        drawn && outlinePath ? { clipPath: `path('${outlinePath}')` } : {}
      "
    >
      <MediaEdge
        :media
        side="right"
        fade="card"
        playback="autoplay"
        :autoplay-reduced-motion="continuousMedia"
        :loop="continuousMedia"
        :muted="continuousMedia"
        media-class="opacity-80 transition duration-300
          group-has-focus-visible:opacity-95 group-hocus:opacity-95
          motion-reduce:duration-150"
        class="w-full"
      />
    </div>

    <div
      class="pointer-events-none relative z-2 flex min-h-full flex-1 flex-col
        gap-sm"
      :class="[compact ? 'p-sm sm:p-md' : 'p-md', { 'text-halo-bg-2': media }]"
    >
      <div
        v-if="label || !hideDate || reminder || secret"
        class="flex max-w-4/5 flex-wrap items-center gap-x-2 gap-y-1 text-xs
          font-semibold text-accent sm:max-w-3/4"
      >
        <!--
          A period's own name reads stronger than a word for its kind, which
          stays as quiet as any other card's label. The mark says which moment
          of the period the card is, and its hint says it in words. It sits
          above the card's link, so a tap on it shows the hint rather than
          opening the card.
        -->
        <span v-if="label && mark" class="flex min-w-0 items-center gap-1.5">
          <Icon v-if="icon" :name="icon" class="shrink-0 opacity-55" />
          <span
            class="pointer-events-auto relative z-3 flex shrink-0 cursor-help
              opacity-80"
            :data-title-popup="labelHint"
            :data-period-mark="mark"
          >
            <PublicPeriodMark :kind="mark" outline />
          </span>
          <span v-if="labelHint" class="sr-only">{{ labelHint }}:</span>
          <span
            class="min-w-0 wrap-break-word"
            :class="labelNamed ? 'opacity-80' : 'opacity-55'"
            >{{ label }}</span
          >
        </span>
        <span v-else-if="label" class="flex items-center gap-2 opacity-55">
          <Icon v-if="icon" :name="icon" class="shrink-0" />
          <span>{{ label }}</span>
        </span>
        <template v-if="!hideDate">
          <TheiLink
            v-if="dateHref"
            :to="dateHref"
            v-bind="titlePopup(...(datePresentation.title ?? []))"
            class="pointer-events-auto relative z-3 inline-flex items-center
              gap-1 text-text-3 transition focus-visible:ring-2
              focus-visible:ring-accent hocus:text-accent"
            :class="datePresentationToneClass(datePresentation)"
          >
            <Icon v-if="datePresentation.approximate" name="approximate" />
            {{ datePresentation.label }}
          </TheiLink>
          <!-- The text lets the pointer through to the card's link; a date
               with a hint to give — the day behind "2 days ago", how sure
               it is — takes the pointer back, as the marks beside it do. -->
          <time
            v-else
            :datetime="date"
            v-bind="titlePopup(...(datePresentation.title ?? []))"
            class="inline-flex items-center gap-1 text-text-3"
            :class="[
              datePresentationToneClass(datePresentation),
              {
                'pointer-events-auto relative z-3':
                  datePresentation.title?.length,
              },
            ]"
          >
            <Icon v-if="datePresentation.approximate" name="approximate" />
            {{ datePresentation.label }}
          </time>
        </template>
        <Icon
          v-if="reminder"
          name="warning"
          v-bind="
            reminderTitlePopup(
              phrase.entity_reminder_badge,
              publicText(reminder),
            )
          "
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
        A clamped block clips its own halo, which draws a hard seam across the
        media, so it gets room for the halo on either side; none above or
        below, where it would uncover the next line. A piece that is not there
        is not drawn, so it takes no step either: an entry that is nothing but
        its excerpts names them right under its date.
      -->
      <div
        v-if="hasCopy"
        class="public-card-copy flex max-w-4/5 min-w-0 flex-col gap-sm
          sm:max-w-3/4"
      >
        <PublicParentLink v-if="parent" :parent="parent" :relation />
        <template v-if="titleless">
          <p
            v-if="summary"
            class="public-card-title -mx-[0.75em] line-clamp-4 px-[0.75em]
              text-base leading-relaxed font-medium text-balance text-text-2
              italic transition sm:text-lg"
          >
            {{ publicText(summary) }}
          </p>
        </template>
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
            class="-mx-[0.75em] mt-xs line-clamp-3 px-[0.75em] text-base
              leading-relaxed font-semibold text-text-2"
          >
            {{ publicText(summary) }}
          </p>
        </div>
        <RelationLine
          v-if="showsRelation && relation"
          :type="relation.type"
          :text="relationText"
          italic
          class="-mx-[0.75em] line-clamp-2 px-[0.75em] text-sm text-text-2"
        />
        <!-- The excerpts in a row while they fit, each a chip (`EntityChip`)
             of its title with the picture of what it is about, or its
             kind's icon, showing the excerpt's card. One about nothing any
             more has a dead face there and says so in a hint in place of
             the card: one element shows one of the two, the hint
             (`resolveHit` in `press-hint-dom.ts`). One the reader may not
             read is its codename, leading nowhere, as a secret card is.
             The chips stay clickable above the card's own full-size
             link. -->
        <ul
          v-if="parts?.length"
          class="flex min-w-0 flex-wrap gap-1.5"
          data-card-parts
        >
          <li
            v-for="part in parts"
            :key="part.secret ? part.key : part.href"
            class="flex min-w-0"
          >
            <EntityChip
              v-if="part.secret"
              :title="publicText(part.title)"
              :media="part.iconMedia"
              icon="excerpt"
              size="sm"
              role="img"
              :aria-label="`${publicText(part.title)} — ${phrase.secret_hint}`"
              :data-title-popup="phrase.secret_hint"
              class="pointer-events-auto z-3"
              data-card-part-secret
            />
            <EntityChip
              v-else
              :title="publicText(part.title)"
              :href="part.href"
              :media="part.about?.iconMedia"
              :icon="
                part.about
                  ? relationEntityIcon(part.about.entityType ?? 'project')
                  : 'face-dead'
              "
              :card="
                part.about
                  ? entityCard('excerpt', {
                      title: part.title,
                      summary: part.summary,
                      iconMedia: part.about.iconMedia,
                    })
                  : undefined
              "
              size="sm"
              :data-title-popup="
                part.about ? undefined : phrase.excerpt_without_about
              "
              class="pointer-events-auto z-3"
            />
          </li>
        </ul>
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
.public-content-card-interactive:is(:focus-visible, :has(:focus-visible)) {
  --tw-shadow-color: var(--public-card-shadow-color);
}

@media (hover: hover) {
  .public-content-card-interactive:hover {
    --tw-shadow-color: var(--public-card-shadow-color);
  }
}

/* The box's shadow, redrawn around a drawn outline. */
.public-outline {
  filter: drop-shadow(0 0.2rem 0.3rem var(--color-shadow-1));
}

.public-content-card-interactive:is(:focus-visible, :has(:focus-visible))
  .public-outline {
  filter: drop-shadow(0 0.6rem 0.9rem var(--public-card-shadow-color));
}

@media (hover: hover) {
  .public-content-card-interactive:hover .public-outline {
    filter: drop-shadow(0 0.6rem 0.9rem var(--public-card-shadow-color));
  }
}

.public-content-card-interactive:is(:focus-visible, :has(:focus-visible))
  .public-card-title {
  color: var(--public-card-accent-color);
}

@media (hover: hover) {
  .public-content-card-interactive:hover .public-card-title {
    color: var(--public-card-accent-color);
  }
}
</style>
