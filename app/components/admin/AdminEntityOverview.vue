<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';

defineProps<{
  entityType: 'project' | 'event' | 'page';
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
    <AdminOverviewHeader
      :icon="entityType"
      :title
      :to="listTo"
      :count
      :new-to="newTo"
      :new-label="newLabel"
    />

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
