<script lang="ts" setup>
import type { PublicEntitySummary } from '#layers/thei/shared/api/public';

defineProps<{ entity: PublicEntitySummary }>();
</script>

<template>
  <PublicContentCard
    :href="entity.href"
    :title="entity.title"
    :summary="entity.summary"
    :label="entity.type === 'event' ? phrase.event : phrase.project"
    :icon="entity.type === 'event' ? 'event' : 'project'"
    :date="entity.date"
    :media="entity.media"
    :projects="entity.relatedProjects"
    :tags="entity.tags"
  />
</template>
