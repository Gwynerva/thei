<script setup lang="ts">
import type { StatusHistoryItem } from '#layers/thei/shared/status';

/**
 * The newest status with its history one click away.
 *
 * Shared by the profile and by a project: both keep the same kind of history,
 * and the only thing that differs is where the older entries are fetched from.
 */
const { historyUrl } = defineProps<{
  current: StatusHistoryItem;
  count: number;
  historyUrl: string;
  title: string;
  /** Tighter spacing for the full-width block on a project page. */
  compact?: boolean;
}>();
const expanded = ref(false);
const history = useProfileHistory<StatusHistoryItem>(historyUrl);
async function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value) await history.load();
}
// The life timeline links a status point straight at this block.
useHashDisclosure('#statuses', expanded, history.load);
</script>
<template>
  <ProfileInfoBlock id="statuses" :title="title" :compact="compact">
    <ProfileStatusItem v-if="!expanded" :item="current" standalone short-date />
    <div v-else class="scrollbar-hover max-h-96 overflow-y-auto pr-xs">
      <div class="divide-y divide-border-1">
        <ProfileStatusItem
          v-for="item in history.items.value"
          :key="item.id"
          :item="item"
          short-date
        />
      </div>
      <ProfileLoadMore
        :more="!history.loaded.value || Boolean(history.cursor.value)"
        :loading="history.loading.value"
        :error="history.error.value"
        @load="history.load"
      />
    </div>
    <div
      class="flex flex-wrap items-center justify-start gap-xs"
      :class="compact ? 'mt-xs' : 'mt-md'"
    >
      <ProfileShowAllButton
        v-if="expanded || count > 1"
        :expanded="expanded"
        @click="toggle"
      />
    </div>
  </ProfileInfoBlock>
</template>
