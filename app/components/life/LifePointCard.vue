<script lang="ts" setup>
import type { LifePoint } from '#layers/thei/shared/life';
import { buildLifeUrl } from '#layers/thei/shared/life';
import type { LifeRewindMatch } from '#layers/thei/shared/life-rewind';
import { lifeEntityKindIcon } from './life-entity-icon';
import { publicDatePrecisionLabels } from '#layers/thei/app/composables/public-date';

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
}>();

const description = computed(() => {
  if (props.rewindMatch === 'ongoing') {
    return props.point.entityKind === 'event'
      ? phrase.value.event_ongoing
      : phrase.value.stage_ongoing;
  }
  const key = `${props.point.entityKind}:${props.point.transition}`;
  const labels: Record<string, string> = {
    'event:started': phrase.value.event_started,
    'event:ended': phrase.value.event_ended,
    'event:occurred': phrase.value.event_occurred,
    'project:created': phrase.value.project_created,
    'page:created': phrase.value.page_created,
    'project-stage:started': phrase.value.stage_started,
    'project-stage:ended': phrase.value.stage_ended,
    'project-stage:occurred': phrase.value.stage_occurred,
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
      precisionLabels: publicDatePrecisionLabels(),
    },
  );
});
const pointIcon = computed(() => lifeEntityKindIcon(props.point.entityKind));
/**
 * A stage or a section names its project above the title: that project is
 * its parent, not something it is related to. A status names its project the
 * same way. Everything else lists what it is related to under the summary.
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
  />
  <PublicContentCard
    v-else-if="point.visibility === 'visible'"
    :href="point.href"
    :title="point.title"
    :summary="point.summary"
    :label="description"
    :icon="pointIcon"
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
