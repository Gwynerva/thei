<script lang="ts" setup>
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
      } else if (session.state === 'active') {
        active.push(session);
      } else {
        destroyed.push(session);
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
    :title="phrase.admin_sessions"
    :description="phrase.admin_sessions_description"
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
      <table class="w-full">
        <thead class="text-left font-semibold tracking-tight text-text-2">
          <tr>
            <th class="w-1/2">{{ phrase.session_details }}</th>
            <th>{{ phrase.created_at }}</th>
            <th>{{ phrase.last_active_at }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="structuredSessions.current">
            <td>
              {{ phrase.this_is_you }}
            </td>
            <td>
              <HumanTime
                :timestamp="structuredSessions.current.createdAt"
                :static="true"
              />
            </td>
            <td class="font-semibold text-accent">{{ phrase.online }}</td>
            <td class="text-text-2 italic">{{ phrase.this_is_you }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Box>
</template>
