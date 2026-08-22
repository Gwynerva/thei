<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';

defineProps<{
  entityType: 'project' | 'event';
  title: string;
  count: number;
  listTo: string;
  newTo: string;
  newLabel: string;
  emptyLabel: string;
  items: Array<{
    id: string;
    title: string;
    summary: string;
    previewMedia?: MediaDescriptor;
    editTo: string;
  }>;
  error?: boolean;
}>();
</script>

<template>
  <Box class="flex flex-col overflow-hidden">
    <div class="flex items-center justify-between gap-sm p-sm">
      <TheiLink :to="listTo" class="group flex min-w-0 items-center gap-xs">
        <Icon
          :name="entityType"
          class="shrink-0 text-xl text-text-2 transition
            group-hocus:text-accent/70"
        />
        <h2
          class="truncate text-lg font-bold transition group-hocus:text-accent"
        >
          {{ title }}
        </h2>
      </TheiLink>
      <div class="flex shrink-0 items-center gap-sm">
        <span class="text-xl font-bold text-text-2">{{ count }}</span>
        <TheiLink
          :to="newTo"
          :aria-label="newLabel"
          :data-title-popup="newLabel"
          class="flex size-9 items-center justify-center rounded-full
            bg-accent/80 text-white transition hocus:bg-accent"
        >
          <Icon name="plus" />
        </TheiLink>
      </div>
    </div>

    <div class="flex flex-1 flex-col border-t border-border-1">
      <template v-if="items.length">
        <AdminEntityListItem
          v-for="item in items"
          :key="item.id"
          :entity-type="entityType"
          :title="item.title"
          :summary="item.summary"
          :preview-media="item.previewMedia"
          :edit-to="item.editTo"
          compact
        />
      </template>
      <div
        v-else
        class="flex flex-1 items-center justify-center p-md text-center text-sm
          text-text-3 italic"
      >
        {{ error ? phrase.failed_to_fetch_data : emptyLabel }}
      </div>
    </div>
  </Box>
</template>
