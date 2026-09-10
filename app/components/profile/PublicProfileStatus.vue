<script setup lang="ts">
import type { ProfileStatusHistoryItem } from '#layers/thei/shared/profile';
defineProps<{ current: ProfileStatusHistoryItem; count: number }>();
const expanded = ref(false);
const history = useProfileHistory<ProfileStatusHistoryItem>(
  '/api/profile/statuses',
);
async function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value) await history.load();
}
useHashDisclosure('#statuses', expanded, history.load);
</script>
<template>
  <ProfileInfoBlock id="statuses" :title="phrase.profile_status">
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
    <div class="mt-md flex flex-wrap items-center justify-start gap-xs">
      <ProfileShowAllButton
        v-if="expanded || count > 1"
        :expanded="expanded"
        @click="toggle"
      />
    </div>
  </ProfileInfoBlock>
</template>
