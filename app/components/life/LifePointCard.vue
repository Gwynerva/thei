<script lang="ts" setup>
import type { LifePoint } from '#layers/thei/shared/life';
import { buildLifeUrl } from '#layers/thei/shared/life';
import type { LifeRewindMatch } from '#layers/thei/shared/life-rewind';
import { lifeEntityKindIcon } from './life-entity-icon';
import { publicDatePrecisionOptions } from '#layers/thei/app/composables/public-date';
import { lifeTransitionMark } from '#layers/thei/shared/public-timeline';

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
   * kind, so a card without an image of its own draws no stand-in icon.
   */
  onRail?: boolean;
}>();

const description = computed(() => {
  if (props.rewindMatch === 'ongoing') {
    return props.point.entityKind === 'event'
      ? phrase.value.event_ongoing
      : phrase.value.section_ongoing;
  }
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
  return getPublicDatePresentation(
    precision
      ? { ...(period ?? { startDate: date, endDate: date }), ...precision }
      : (period ?? date),
    language.value.code,
    new Date(),
    {
      style: props.dateStyle ?? (props.compact ? 'short' : 'long'),
      ...publicDatePrecisionOptions(),
    },
  );
});
const pointIcon = computed(() => lifeEntityKindIcon(props.point.entityKind));
/**
 * A period the owner named is announced by its name, with the mark of the
 * moment it is — start, end, the day — rather than by a sentence that every
 * card of its kind repeats. The sentence stays as the mark's hint.
 */
const periodLabel = computed(() =>
  props.point.visibility === 'visible' && props.point.periodLabel
    ? publicText(props.point.periodLabel)
    : undefined,
);
const periodMark = computed(() =>
  periodLabel.value ? lifeTransitionMark(props.point.transition) : undefined,
);
/** The moment the card is of the named period, in one plain word. */
const periodLead = computed(() => {
  if (props.rewindMatch === 'ongoing') return phrase.value.period_ongoing;
  switch (props.point.transition) {
    case 'started':
      return phrase.value.period_started;
    case 'ended':
      return phrase.value.period_ended;
    default:
      return phrase.value.period_occurred;
  }
});
/**
 * A section names its project above the title: that project is
 * its parent, not something it is related to. A status names its project too,
 * under its words. Everything else lists what it is related to under the
 * summary.
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
    :label="periodMark ? periodLabel : description"
    :icon="pointIcon"
    :mark="periodMark"
    :label-lead="periodMark ? periodLead : undefined"
    :label-hint="periodMark ? description : undefined"
    :date="point.date"
    :period="point.period"
    :date-href="rewindMatch ? undefined : buildLifeUrl({ date: point.date })"
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
    :label="description"
    :icon="pointIcon"
    :date="point.date"
    :period="point.period"
    :date-href="rewindMatch ? undefined : buildLifeUrl({ date: point.date })"
    :date-presentation="datePresentation"
    :media="point.media"
    :compact="compact"
    :hide-date="hideDate"
  />
</template>
