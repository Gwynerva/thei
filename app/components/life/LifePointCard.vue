<script lang="ts" setup>
import type { LifePoint } from '#layers/thei/shared/life';
import { buildLifeUrl } from '#layers/thei/shared/life';

const props = defineProps<{ point: LifePoint; compact?: boolean }>();

const description = computed(() => {
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
const secretTitle = computed(() => {
  if (props.point.entityKind === 'event') return phrase.value.secret_event;
  if (props.point.entityKind === 'project') return phrase.value.secret_project;
  if (props.point.entityKind === 'page') return phrase.value.secret_page;
  if (props.point.entityKind === 'project-stage')
    return phrase.value.secret_stage;
  return phrase.value.secret_section;
});
const datePresentation = computed(() =>
  getPublicDatePresentation(
    props.point.period ?? props.point.date,
    language.value.code,
  ),
);
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
  <PublicContentCard
    v-if="point.visibility === 'visible'"
    :href="point.href"
    :title="point.title"
    :summary="point.summary"
    :label="description"
    :icon="pointIcon"
    :date="point.date"
    :period="point.period"
    :date-href="buildLifeUrl(point.date)"
    :media="point.media"
    :projects="projects"
    :tags="point.tags"
    :compact="compact"
  />
  <article
    v-else
    class="relative block min-w-0 overflow-hidden rounded-normal border
      border-border-1 bg-bg-2 shadow-md shadow-shadow-1"
  >
    <div class="flex items-start gap-sm p-sm sm:p-md">
      <span
        class="flex size-12 shrink-0 items-center justify-center rounded-full
          border border-border-2 bg-bg-3 text-2xl text-text-2"
      >
        <Icon name="lock-close" />
      </span>
      <div class="min-w-0 flex-1">
        <div
          class="flex flex-wrap items-center gap-2 text-xs font-semibold
            text-text-3"
        >
          <Icon :name="pointIcon" class="shrink-0" />
          <p>{{ description }}</p>
          <TheiLink
            :to="buildLifeUrl(point.date)"
            :data-title-popup="datePresentation.title"
            class="transition focus-visible:ring-2 focus-visible:ring-accent
              hocus:text-accent"
          >
            {{ datePresentation.label }}
          </TheiLink>
        </div>
        <h3 class="font-bold tracking-tight">{{ secretTitle }}</h3>
        <p class="mt-1 text-sm text-text-3">••••••••••••••••</p>
      </div>
    </div>
  </article>
</template>
