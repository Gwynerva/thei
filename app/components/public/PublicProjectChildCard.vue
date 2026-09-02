<script lang="ts" setup>
import type {
  PublicProjectSection,
  PublicProjectStage,
} from '#layers/thei/shared/api/public';

withDefaults(
  defineProps<{
    item: PublicProjectStage | PublicProjectSection;
    kind: 'stage' | 'section';
    showType?: boolean;
  }>(),
  { showType: false },
);
</script>

<template>
  <PublicContentCard
    :href="item.href"
    :title="item.title"
    :summary="item.summary"
    :label="
      showType
        ? kind === 'stage'
          ? phrase.project_stage
          : phrase.content_section
        : undefined
    "
    :icon="
      showType ? (kind === 'stage' ? 'calendar' : 'file-tray-stack') : undefined
    "
    :date="item.date"
    :period="'period' in item ? item.period : undefined"
    :media="item.media"
  />
</template>
