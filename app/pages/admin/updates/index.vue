<script lang="ts" setup>
import type {
  UpdateRunStatus,
  UpdateStep,
  UpdateStatus,
} from '#layers/thei/update/types';
import type { IconName } from '#thei/icons';

type ActionResponse =
  { type: 'success' } | { type: 'error'; code?: string; message: string };

definePageMeta({ layout: 'admin' });

await useAdminTabTitle(computed(() => phrase.value.admin_updates));

const { data: status, refresh } = await useFetch<UpdateStatus>(
  '/api/admin/updates',
  { key: 'admin-updates' },
);

const busy = ref(false);
const error = ref<string>();
// Set once the server has told us it is going down, so the page knows to
// reload itself into the new version instead of just reporting success.
const awaitingRestart = ref(false);

const state = computed(() => status.value?.state);
const running = computed(() => Boolean(status.value?.running));
const managed = computed(() => Boolean(status.value?.managed));

const statusLabels: Record<UpdateRunStatus, () => string> = {
  running: () => phrase.value.update_status_running,
  restarting: () => phrase.value.update_status_restarting,
  done: () => phrase.value.update_status_done,
  failed: () => phrase.value.update_status_failed,
};

const statusLabel = computed(() =>
  state.value ? statusLabels[state.value.status]() : '',
);

const stepIcons: Record<UpdateStep['status'], IconName> = {
  pending: 'minus',
  running: 'loading',
  done: 'check',
  failed: 'close',
  skipped: 'minus',
};

function stepKind(step: UpdateStep): string | undefined {
  if (step.kind === 'phase') return phrase.value.update_step_phase;
  if (step.kind === 'migration') return phrase.value.update_step_migration;
}

const availability = computed(() => {
  const value = status.value;
  if (!value) return '';
  if (value.checkError) return phrase.value.update_check_failed;
  if (!value.latestVersion) return phrase.value.update_never_checked;
  if (!value.updateAvailable) return phrase.value.update_up_to_date;
  return phrase.value.update_available_x(value.latestVersion);
});

// The old process dies mid-poll, so failed requests are expected here and
// useAutoRefresh already swallows them: polling simply resumes once the new
// process is listening.
const { forceRefresh } = useAutoRefresh(async () => {
  await refresh();

  if (state.value?.status === 'restarting') awaitingRestart.value = true;

  if (awaitingRestart.value && state.value && !running.value) {
    // The new build ships new client assets, so a full reload is the only
    // honest way to show the updated site.
    awaitingRestart.value = false;
    window.location.reload();
  }
}, 1000);

async function act(url: string, confirmText?: string) {
  if (busy.value) return;
  if (confirmText && !window.confirm(confirmText)) return;

  busy.value = true;
  error.value = undefined;

  try {
    const response = await $fetch<ActionResponse>(url, { method: 'POST' });
    if (response.type === 'error') error.value = response.message;
  } catch (thrown) {
    error.value = thrown instanceof Error ? thrown.message : String(thrown);
  } finally {
    busy.value = false;
    await forceRefresh();
  }
}

function check() {
  return act('/api/admin/updates/check');
}

function update() {
  const version = status.value?.latestVersion;
  if (!version) return;
  return act('/api/admin/updates/start', phrase.value.update_confirm(version));
}

async function restart() {
  awaitingRestart.value = true;
  await act('/api/admin/updates/restart', phrase.value.update_restart_confirm);
}
</script>

<template>
  <div>
    <StickyGlassHeader width="var(--width-wide)" :error="error">
      <div class="flex items-center justify-between gap-xs py-xs">
        <h1 class="flex min-w-0 items-center gap-xs text-xl font-bold">
          <Icon name="refresh" class="shrink-0" />
          <span class="truncate">{{ phrase.admin_updates }}</span>
        </h1>
        <Button
          variant="secondary"
          class="shrink-0"
          :disabled="busy || running || !managed"
          @click="restart"
        >
          <Icon name="power" class="mr-xs" />{{ phrase.update_restart }}
        </Button>
      </div>
    </StickyGlassHeader>

    <div class="m-auto flex w-(--width-wide) flex-col px-window py-lg">
      <SectionHeader
        class="mb-md"
        :title="phrase.admin_updates"
        :description="phrase.updates_description"
      />

      <Box class="mb-lg">
        <div class="flex flex-col gap-md p-md">
          <InfoBlock
            :rows="[
              {
                label: phrase.update_current_version,
                value: status?.currentVersion,
              },
              {
                label: phrase.update_latest_version,
                value: status?.latestVersion ?? '—',
              },
            ]"
          />

          <p
            class="text-sm"
            :class="
              status?.updateAvailable
                ? 'font-semibold text-accent'
                : 'text-text-3'
            "
          >
            {{ busy && !running ? phrase.update_checking : availability }}
          </p>

          <div class="flex flex-wrap gap-sm">
            <Button
              variant="secondary"
              :disabled="busy || running"
              @click="check"
            >
              <Icon name="arrow-cycle" class="mr-xs" />{{ phrase.update_check }}
            </Button>
            <Button
              :disabled="
                busy || running || !managed || !status?.updateAvailable
              "
              @click="update"
            >
              <Icon name="cloud-upload" class="mr-xs" />{{
                phrase.update_start
              }}
            </Button>
          </div>

          <p v-if="managed" class="text-sm text-text-3">
            {{ phrase.update_backup_notice }}
          </p>
        </div>

        <div
          v-if="!managed"
          class="flex gap-xs border-t border-border-1 px-md py-sm text-sm
            text-text-3"
        >
          <Icon name="warning" class="mt-0.5 shrink-0 text-text-2" />
          <span>
            <span class="font-semibold text-text-2">
              {{ phrase.update_unmanaged }}.
            </span>
            {{ phrase.update_unmanaged_hint }}
          </span>
        </div>
      </Box>

      <template v-if="state">
        <SectionHeader class="mb-md" :title="phrase.update_log" />

        <Box>
          <div class="flex flex-wrap items-center gap-sm p-md">
            <Icon
              v-if="running"
              name="loading"
              class="shrink-0 text-accent"
              aria-hidden="true"
            />
            <span class="font-semibold">{{ statusLabel }}</span>
            <span class="text-sm text-text-3">
              {{
                state.status === 'done'
                  ? phrase.update_done_x(state.toVersion)
                  : `${state.fromVersion} → ${state.toVersion}`
              }}
            </span>
            <span
              v-if="awaitingRestart"
              class="text-sm text-text-3"
              role="status"
            >
              {{ phrase.update_restart_pending }}
            </span>
          </div>

          <ol
            v-if="state.steps.length"
            class="flex flex-col border-t border-border-1 px-md py-sm"
            :aria-label="phrase.update_steps"
          >
            <li
              v-for="step in state.steps"
              :key="step.id"
              class="flex gap-sm py-xs"
              :class="{ 'opacity-60': step.status === 'skipped' }"
              :data-update-step="step.status"
            >
              <span
                class="mt-0.5 flex size-6 shrink-0 items-center justify-center
                  rounded-full text-sm"
                :class="{
                  'bg-bg-3 text-text-3':
                    step.status === 'pending' || step.status === 'skipped',
                  'bg-accent/15 text-accent': step.status === 'running',
                  'bg-accent text-white': step.status === 'done',
                  'bg-bg-error text-text-error': step.status === 'failed',
                }"
                aria-hidden="true"
              >
                <Icon :name="stepIcons[step.status]" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="flex flex-wrap items-baseline gap-x-xs">
                  <span
                    class="font-semibold"
                    :class="
                      step.status === 'pending' ? 'text-text-2' : 'text-text-1'
                    "
                  >
                    {{ step.title }}
                  </span>
                  <span v-if="stepKind(step)" class="text-xs text-text-3">
                    {{ stepKind(step) }}
                  </span>
                </span>
                <span v-if="step.description" class="text-sm text-text-3">
                  {{ step.description }}
                </span>
                <span
                  v-if="step.error"
                  class="text-sm break-words text-text-error"
                >
                  {{ step.error }}
                </span>
              </span>
            </li>
          </ol>

          <div
            v-if="state.status === 'failed'"
            class="border-t border-border-error bg-bg-error px-md py-sm text-sm
              text-text-error"
          >
            <p class="font-semibold">{{ state.error }}</p>
            <p>{{ phrase.update_failed_hint }}</p>
          </div>

          <pre
            v-if="state.log.length"
            class="max-h-96 overflow-auto border-t border-border-1 px-md py-sm
              text-xs leading-relaxed text-text-3"
          ><code>{{ state.log.join('\n') }}</code></pre>
        </Box>
      </template>
    </div>
  </div>
</template>
