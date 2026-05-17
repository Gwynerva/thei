<script lang="ts" setup>
const { state } = defineProps<{ state: 'destroyed' | 'active' }>();

const { data, error, refresh, pending } = await useFetch(
  '/api/admin/sessions/',
  { key: 'admin-sessions' },
);

const structuredSessions = computed(() => {
  type Session = NonNullable<typeof data.value>[number];

  let current: Session | undefined;
  let active: Session[] = [];
  let destroyed: Session[] = [];

  if (data.value) {
    for (const session of data.value) {
      if (session.current) {
        current = session;
      } else if (session.destroyed) {
        destroyed.push(session);
      } else {
        active.push(session);
      }
    }
  }

  return {
    current,
    active: active.length > 0 ? active : undefined,
    destroyed: destroyed.length > 0 ? destroyed : undefined,
  };
});

let refreshInterval: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  refreshInterval = setInterval(() => {
    if (!pending.value) {
      refresh();
    }
  }, 5000);
});

onUnmounted(() => {
  clearInterval(refreshInterval);
});
</script>

<template>
  <Box
    icon="person-key"
    :title="
      state === 'active' ? phrase.active_sessions : phrase.archived_sessions
    "
    :description="
      state === 'active'
        ? phrase.active_sessions_description
        : phrase.archived_sessions_description
    "
  >
    <div
      v-if="error"
      class="rounded-lg border border-border-error bg-bg-error p-xs
        text-text-error"
    >
      <Icon name="warning" class="mr-xs" />
      <span>{{ phrase.failed_to_fetch_data }}</span>
      <span v-if="error.message">{{ error.message }}</span>
    </div>
    <div v-else-if="structuredSessions">
      <div v-if="structuredSessions.current"></div>
    </div>
  </Box>
</template>
