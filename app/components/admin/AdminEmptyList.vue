<script lang="ts" setup>
import type { IconName } from '#thei/icons';

/**
 * Empty state of an admin list. While a search is active it explains that
 * nothing matched and offers to clear the query; otherwise it invites the
 * author to create the first entity.
 */
defineProps<{
  icon: IconName;
  title: string;
  description: string;
  searching?: boolean;
  createTo?: string;
  createLabel?: string;
}>();

const emit = defineEmits<{ resetSearch: [] }>();
</script>

<template>
  <EmptyState
    v-if="searching"
    :icon="icon"
    :title="phrase.admin_search_no_results"
    :description="phrase.admin_search_no_results_description"
  >
    <button
      type="button"
      class="flex cursor-pointer items-center gap-xs rounded-normal border
        border-border-1 bg-bg-1 px-sm py-xs text-sm font-semibold text-text-2
        transition hocus:border-border-3 hocus:text-text-1"
      @click="emit('resetSearch')"
    >
      <Icon name="close" />
      <span>{{ phrase.reset_search }}</span>
    </button>
  </EmptyState>
  <EmptyState v-else :icon="icon" :title="title" :description="description">
    <TheiLink
      v-if="createTo && createLabel"
      :to="createTo"
      class="flex items-center gap-xs rounded-normal bg-accent/80 px-sm py-xs
        text-sm font-semibold text-white transition hocus:bg-accent"
    >
      <Icon name="plus-circle" />
      <span>{{ createLabel }}</span>
    </TheiLink>
  </EmptyState>
</template>
