<script lang="ts" setup>
import type { LifePoint } from '#layers/thei/shared/life';
import { buildLifeUrl } from '#layers/thei/shared/life';
import type { LifeRewindMatch } from '#layers/thei/shared/life-rewind';
import { lifeEntityKindIcon } from './life-entity-icon';
import { publicDatePrecisionOptions } from '#layers/thei/app/composables/public-date';
import {
  lifePointMark,
  publicTimelinePeriodDuration,
} from '#layers/thei/shared/public-timeline';
import { formatPublicDateAtPrecision } from '#layers/thei/shared/public-date-format';

const props = defineProps<{
  point: LifePoint;
  compact?: boolean;
  dateStyle?: 'long' | 'short';
  rewindMatch?: LifeRewindMatch;
  /**
   * Leaves the date to the rail the card hangs on. The chronology passes it
   * for every card whose date says nothing the day's header does not.
   */
  hideDate?: boolean;
  /**
   * The card hangs on the chronology rail, whose marker already shows its
   * kind and whose day header its date: a card without an image of its own
   * draws no stand-in icon, and a start or an end of a period says where the
   * period's other end is instead of repeating the day.
   */
  onRail?: boolean;
}>();

const style = computed(
  () => props.dateStyle ?? (props.compact ? 'short' : 'long'),
);
/** Which moment of its period the card stands for, when it is a period's. */
const mark = computed(() => lifePointMark(props.point, props.rewindMatch));
/** What happened, in a sentence of its kind: "An event started". */
const description = computed(() => {
  const isEvent = props.point.entityKind === 'event';
  // A Rewind day is always in a year gone by; the feed's own running period
  // is going on now.
  if (props.rewindMatch === 'ongoing')
    return isEvent
      ? phrase.value.event_was_ongoing
      : phrase.value.section_was_ongoing;
  if (props.point.ongoing)
    return isEvent ? phrase.value.event_ongoing : phrase.value.section_ongoing;
  const key = `${props.point.entityKind}:${props.point.transition}`;
  const labels: Record<string, string> = {
    'event:started': phrase.value.event_started,
    'event:ended': phrase.value.event_ended,
    'event:occurred': phrase.value.event_occurred,
    'project:created': phrase.value.project_created,
    'page:created': phrase.value.page_created,
    'project-section:started': phrase.value.section_started,
    'project-section:ended': phrase.value.section_ended,
    'project-section:occurred': phrase.value.section_occurred,
    'project-section:created': phrase.value.section_created,
    'diary-entry:created': phrase.value.diary_written,
  };
  return labels[key] ?? phrase.value.life;
});
const periodLabel = computed(() =>
  props.point.visibility === 'visible' && props.point.periodLabel
    ? publicText(props.point.periodLabel)
    : undefined,
);
/**
 * A card of a period is announced by the period's name, or by its kind when
 * the owner gave it none — "Event" — and by its mark: which moment of the
 * period it is, the shape tells, and the sentence of it is the mark's hint.
 * A name never agrees with a verb that way, whatever its gender or number.
 */
const markLabel = computed(() => {
  if (!mark.value) return undefined;
  return (
    periodLabel.value ??
    (props.point.entityKind === 'event'
      ? phrase.value.event
      : phrase.value.section)
  );
});
/**
 * On the rail the day header already gives a start or an end its day; the
 * card says where the period goes from there — to its end, or from its
 * start and for how long — and leads to that other day.
 */
const otherEnd = computed(() => {
  const { period, precision, transition, ongoing } = props.point;
  if (!props.onRail || props.rewindMatch || !period) return undefined;
  const locale = language.value.code;
  const at = (date: string) =>
    formatPublicDateAtPrecision(
      date,
      precision?.precision,
      locale,
      style.value,
    );
  if (transition === 'started')
    return ongoing
      ? { label: phrase.value.period_until(at(period.endDate).governed) }
      : {
          label: phrase.value.public_timeline_until(
            at(period.endDate).standalone,
          ),
          date: period.endDate,
        };
  if (transition === 'ended') {
    const duration = publicTimelinePeriodDuration(period);
    return {
      label: `${phrase.value.public_timeline_from(at(period.startDate).governed)} · ${phrase.value.public_timeline_duration(duration.years, duration.months, duration.days)}`,
      date: period.startDate,
    };
  }
  return undefined;
});
const datePresentation = computed(() => {
  if (props.rewindMatch) {
    return {
      label: formatPublicRewindDate(
        props.point.date,
        props.point.period,
        language.value.code,
      ),
    };
  }
  const { date, period, precision } = props.point;
  const presentation = getPublicDatePresentation(
    precision
      ? { ...(period ?? { startDate: date, endDate: date }), ...precision }
      : (period ?? date),
    language.value.code,
    new Date(),
    { style: style.value, ...publicDatePrecisionOptions() },
  );
  return otherEnd.value
    ? { ...presentation, label: otherEnd.value.label }
    : presentation;
});
const dateHref = computed(() => {
  if (props.rewindMatch) return undefined;
  if (otherEnd.value)
    return otherEnd.value.date
      ? buildLifeUrl({ date: otherEnd.value.date })
      : undefined;
  return buildLifeUrl({ date: props.point.date });
});
/**
 * Which way a card's period goes on from it, newest at the top: up from a
 * start, down from an end. A card holding the whole stretch is closed.
 */
const continues = computed(() =>
  mark.value === 'start' || mark.value === 'ongoing'
    ? 'up'
    : mark.value === 'end'
      ? 'down'
      : undefined,
);
const pointIcon = computed(() => lifeEntityKindIcon(props.point.entityKind));
/** On the rail, a period's mark stands alone: the marker shows the kind. */
const labelIcon = computed(() =>
  props.onRail && mark.value ? undefined : pointIcon.value,
);
/**
 * A section names its project above the title: that project is its parent,
 * not something it is related to. A status names its project too, under its
 * words. Everything else lists what it is related to under the summary.
 */
const parent = computed(() =>
  props.point.visibility === 'visible' ? props.point.project : undefined,
);
const projects = computed(() =>
  props.point.visibility === 'visible'
    ? (props.point.relatedEntities ?? [])
    : [],
);
</script>

<template>
  <LifeProfileCard
    v-if="
      point.visibility === 'visible' &&
      (point.entityKind === 'profile-avatar' ||
        point.entityKind === 'profile-status')
    "
    :point="point"
    :compact="compact"
    :date-style="dateStyle"
    :rewind="Boolean(rewindMatch)"
    :hide-date="hideDate"
    :hide-fallback-icon="onRail"
    :parent="parent"
  />
  <PublicContentCard
    v-else-if="point.visibility === 'visible'"
    :href="point.href"
    :title="point.title"
    :summary="point.summary"
    :label="markLabel ?? description"
    :icon="labelIcon"
    :mark="mark"
    :continues="onRail && !rewindMatch ? continues : undefined"
    :label-hint="mark ? description : undefined"
    :label-named="Boolean(periodLabel)"
    :date="point.date"
    :period="point.period"
    :date-href="dateHref"
    :date-presentation="datePresentation"
    :media="point.media"
    :continuous-media="point.entityKind === 'project'"
    :titleless="point.entityKind === 'diary-entry'"
    :cloud="point.entityKind === 'diary-entry'"
    :projects="projects"
    :parent="parent"
    :tags="point.tags"
    :compact="compact"
    :hide-date="hideDate"
  />
  <PublicContentCard
    v-else
    secret
    :cloud="point.entityKind === 'diary-entry'"
    :title="point.title"
    :summary="point.summary"
    :label="markLabel ?? description"
    :icon="labelIcon"
    :mark="mark"
    :label-hint="mark ? description : undefined"
    :continues="onRail && !rewindMatch ? continues : undefined"
    :date="point.date"
    :period="point.period"
    :date-href="dateHref"
    :date-presentation="datePresentation"
    :media="point.media"
    :compact="compact"
    :hide-date="hideDate"
  />
</template>
