<script lang="ts" setup>
import type { LifePoint } from '#layers/thei/shared/life';
import { buildLifeUrl } from '#layers/thei/shared/life';
import type { LifeRewindMatch } from '#layers/thei/shared/life-rewind';

const props = defineProps<{
  point: LifePoint;
  compact?: boolean;
  dateStyle?: 'long' | 'short';
  rewindMatch?: LifeRewindMatch;
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
  return getPublicDatePresentation(
    props.point.period ?? props.point.date,
    language.value.code,
    new Date(),
    { style: props.dateStyle ?? (props.compact ? 'short' : 'long') },
  );
});
const pointIcon = computed(() => {
  if (props.point.entityKind === 'event') return 'event';
  if (props.point.entityKind === 'page') return 'page';
  if (props.point.entityKind === 'project-stage') return 'calendar';
  if (props.point.entityKind === 'project-section') return 'file-tray-stack';
  return 'project';
});
const projects = computed(() => {
  if (props.point.visibility !== 'visible') return [];
  return props.point.project
    ? [props.point.project]
    : (props.point.relatedProjects ?? []);
});
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
    :date-href="rewindMatch ? undefined : buildLifeUrl(point.date)"
    :date-presentation="datePresentation"
    :media="point.media"
    :continuous-media="point.entityKind === 'project'"
    :projects="projects"
    :tags="point.tags"
    :compact="compact"
  />
  <PublicContentCard
    v-else
    secret
    :title="point.title"
    :summary="point.summary"
    :label="description"
    :icon="pointIcon"
    :date="point.date"
    :period="point.period"
    :date-href="rewindMatch ? undefined : buildLifeUrl(point.date)"
    :date-presentation="datePresentation"
    :media="point.media"
    :compact="compact"
  />
</template>
