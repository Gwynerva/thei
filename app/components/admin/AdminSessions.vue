<script lang="ts" setup>
const liveNow = useLiveNow();

const { data, error, refresh } = await useFetch('/api/admin/sessions/', {
  key: 'admin-sessions',
});

type Session = NonNullable<typeof data.value>[number];

const structuredSessions = computed(() => {
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

  if (!current && !active.length && !destroyed.length) {
    return undefined;
  }

  return {
    current,
    active: active.length > 0 ? active : undefined,
    destroyed: destroyed.length > 0 ? destroyed : undefined,
  };
});

function sessionDetails(session: Session) {
  const infoBlocks: string[] = [];

  if (session.ip) {
    infoBlocks.push(`${session.ip}`);
  }

  if (session.meta.browser || session.meta.os) {
    infoBlocks.push(
      [session.meta.browser, session.meta.os].filter(Boolean).join(', '),
    );
  }

  if (session.meta.device || session.meta.deviceVendor) {
    infoBlocks.push(
      [session.meta.deviceVendor, session.meta.device]
        .filter(Boolean)
        .join(', '),
    );
  }

  if (session.meta.country || session.meta.city) {
    const location = [session.meta.city, session.meta.country]
      .filter(Boolean)
      .join(', ');
    infoBlocks.push(`${location}`);
  }

  return infoBlocks.join(' - ');
}

const showDestroyedSessions = ref(false);
const requestFetch = useRequestFetch();
const destroyingSessions = reactive(new Set<string>());
async function destroySession(sessionUuid: string) {
  if (destroyingSessions.has(sessionUuid)) {
    return;
  }

  destroyingSessions.add(sessionUuid);

  try {
    await requestFetch(`/api/admin/sessions/${sessionUuid}/`, {
      method: 'DELETE',
    });
    await forceRefresh();
  } catch {
  } finally {
    destroyingSessions.delete(sessionUuid);
  }
}

const refreshInterval = 5000;
let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
let refreshStopped = false;
let refreshPromise: Promise<void> | undefined;
async function _refresh() {
  clearTimeout(refreshTimeout);

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = refresh()
    .catch(() => {})
    .finally(() => {
      refreshPromise = undefined;

      if (!refreshStopped) {
        refreshTimeout = setTimeout(_refresh, refreshInterval);
      }
    });

  return refreshPromise;
}
async function forceRefresh() {
  clearTimeout(refreshTimeout);
  try {
    await refresh();
  } catch {
  } finally {
    if (!refreshStopped) {
      refreshTimeout = setTimeout(_refresh, refreshInterval);
    }
  }
}

onMounted(() => {
  refreshStopped = false;
  refreshTimeout = setTimeout(_refresh, refreshInterval);
});

onUnmounted(() => {
  refreshStopped = true;
  clearTimeout(refreshTimeout);
});
</script>

<template>
  <SectionHeader
    icon="person-key"
    :title="phrase.admin_sessions"
    :description="phrase.admin_sessions_description"
    class="mb-md"
  />
  <div
    v-if="error"
    class="mb-md rounded-normal border border-border-error bg-bg-error p-xs
      text-text-error"
  >
    <Icon name="warning" class="mr-xs" />
    <span>{{ phrase.failed_to_fetch_data }}</span>
    <span v-if="error.message" class="ml-xs">{{ error.message }}</span>
  </div>
  <Box v-if="structuredSessions">
    <div class="overflow-auto">
      <table class="w-full">
        <thead>
          <tr class="th">
            <th class="w-full rounded-tl-normal p-td-tight text-left">
              {{ phrase.session_details }}
            </th>
            <th class="min-w-42 p-td-tight text-left max-sm:hidden">
              {{ phrase.created_at }}
            </th>
            <th class="min-w-38 p-td-tight text-left sm:min-w-42">
              {{ phrase.last_active_at }}
            </th>
            <th class="min-w-22 rounded-tr-normal"></th>
          </tr>
        </thead>
        <tbody>
          <!-- Current session -->
          <tr v-if="structuredSessions.current" class="tr-normal">
            <td class="p-td">
              {{ sessionDetails(structuredSessions.current) }}
            </td>
            <td class="p-td text-text-2 max-sm:hidden">
              <TheiTime :datetime="structuredSessions.current.createdAt" />
            </td>
            <td class="p-td font-semibold text-accent">
              {{ phrase.online }}
            </td>
            <td class="p-td text-center text-sm text-text-2 italic">
              {{ phrase.this_is_you }}
            </td>
          </tr>
          <!-- Active sessions -->
          <template v-if="structuredSessions.active">
            <tr class="tr-section">
              <td colspan="4" class="p-td-tight text-sm">
                <div class="text-text-2">
                  {{ phrase.active_admin_sessions }}
                </div>
                <div class="text-text-3">
                  {{ phrase.active_admin_sessions_description }}
                </div>
              </td>
            </tr>
            <tr
              v-for="session in structuredSessions.active"
              :key="session.sessionUuid"
              class="tr-normal"
            >
              <td class="p-td">
                {{ sessionDetails(session) }}
              </td>
              <td class="p-td text-text-2 max-sm:hidden">
                <TheiTime :datetime="session.createdAt" />
              </td>
              <td class="p-td font-semibold text-text-2">
                <TheiTime
                  v-if="liveNow - session.lastUsedAt > 60 * 1000"
                  :datetime="session.lastUsedAt"
                />
                <span v-else class="text-accent">{{ phrase.online }}</span>
              </td>
              <td
                v-if="destroyingSessions.has(session.sessionUuid)"
                class="text-center"
              >
                <Icon name="loading" class="text-lg text-text-2" />
              </td>
              <td
                v-else
                :thei-title-popup="phrase.destroy_session"
                class="cursor-pointer p-td text-center text-text-error/50
                  transition hocus:text-text-error"
              >
                <button
                  @click="destroySession(session.sessionUuid)"
                  class="cursor-pointer"
                >
                  <Icon name="delete" class="text-lg" />
                </button>
              </td>
            </tr>
          </template>
          <template v-if="structuredSessions.destroyed">
            <!-- Destroyed sessions -->
            <template v-if="showDestroyedSessions">
              <tr class="tr-section">
                <td colspan="4" class="p-td-tight text-sm">
                  <div class="text-text-2">
                    {{ phrase.destroyed_admin_sessions }}
                  </div>
                  <div class="text-text-3">
                    {{ phrase.destroyed_admin_sessions_description }}
                  </div>
                </td>
              </tr>
              <tr
                v-for="session in structuredSessions.destroyed"
                :key="session.sessionUuid"
                class="tr-normal"
              >
                <td class="p-td text-text-2">
                  {{ sessionDetails(session) }}
                </td>
                <td class="p-td text-text-2 max-sm:hidden">
                  <TheiTime :datetime="session.createdAt" />
                </td>
                <td class="p-td font-semibold text-text-2">
                  <TheiTime :datetime="session.lastUsedAt" />
                </td>
                <td></td>
              </tr>
            </template>
            <!-- Show destroyed sessions button -->
            <tr v-else class="tr-section">
              <td colspan="4" class="p-td-tight text-sm">
                <button
                  @click="showDestroyedSessions = true"
                  class="cursor-pointer text-sm text-text-3 underline
                    decoration-text-3/50 transition hocus:text-text-1
                    hocus:decoration-text-3"
                >
                  {{
                    phrase.show_x_destroyed_sessions(
                      structuredSessions.destroyed.length,
                    )
                  }}
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </Box>
</template>
