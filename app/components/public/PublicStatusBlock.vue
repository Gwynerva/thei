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
// A find of the search lands on a status: the history opens and is read on
// to its day.
useLandingReveal(async (target) => {
  if (target.zone !== 'statuses') return;
  expanded.value = true;
  await history.load();
  const day = target.status;
  const listed = () => history.items.value.some((item) => item.date === day);
  for (
    let more = 0;
    day &&
    more < 40 &&
    !listed() &&
    history.cursor.value &&
    !history.error.value;
    more++
  )
    await history.load();
});
</script>
<template>
  <ProfileInfoBlock
    id="statuses"
    data-landing-zone="statuses"
    :title="title"
    :compact="compact"
    class="scroll-mt-[var(--public-anchor-offset,8rem)]"
  >
    <ProfileStatusItem v-if="!expanded" :item="current" standalone short-date />
    <div v-else class="scrollbar-hover max-h-96 overflow-y-auto pr-xs">
      <div class="divide-y divide-border-1">
        <ProfileStatusItem
          v-for="item in history.items.value"
          :key="item.id"
          :item="item"
          :data-status-date="item.date"
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
