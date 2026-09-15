<script lang="ts" setup>
import { isBackupStale, type BackupStatus } from '#layers/thei/shared/backup';

const humanSize = useHumanSize();
const { data: status, refresh } = await useFetch<BackupStatus>(
  '/api/admin/backup',
  { key: 'admin-backup' },
);

const busy = ref(false);
const error = ref<string>();
/**
 * Held only until the page is left.
 *
 * The server never hands the token back, so this is the one moment it can be
 * copied — and the one place it should be able to disappear from.
 */
const freshToken = ref<string>();

const lastBackup = computed(() => status.value?.lastBackup);
const stale = computed(() => isBackupStale(lastBackup.value?.completedAt));

async function generate() {
  await act(async () => {
    const result = await $fetch<{ token: string }>('/api/admin/backup/token', {
      method: 'POST',
    });
    freshToken.value = result.token;
  });
}

async function revoke() {
  await act(async () => {
    await $fetch('/api/admin/backup/token', { method: 'DELETE' });
    freshToken.value = undefined;
  });
}

async function act(work: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = undefined;
  try {
    await work();
    await refresh();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

function kindLabel(kind: 'auto' | 'manual') {
  return kind === 'auto'
    ? phrase.value.backup_kind_auto
    : phrase.value.backup_kind_manual;
}
</script>

<template>
  <Box class="flex flex-col gap-md p-sm sm:p-md">
    <div
      v-if="stale"
      class="flex items-start gap-xs rounded-normal border border-border-error
        bg-bg-error p-xs text-sm text-text-error"
      role="status"
    >
      <Icon name="warning" class="mt-0.5 shrink-0" />
      <span>{{ phrase.backup_stale_warning }}</span>
    </div>

    <div class="flex flex-wrap items-baseline gap-x-sm gap-y-1 text-sm">
      <span class="text-text-2">{{ phrase.backup_last }}:</span>
      <span v-if="lastBackup" class="font-semibold">
        <TheiTime :datetime="lastBackup.completedAt" />
      </span>
      <span v-else class="font-semibold text-text-3">
        {{ phrase.backup_never }}
      </span>
      <span v-if="lastBackup" class="text-text-3">
        {{ kindLabel(lastBackup.kind) }} ·
        {{
          phrase.backup_run_summary(
            lastBackup.fileCount,
            humanSize(lastBackup.byteCount),
          )
        }}
      </span>
    </div>

    <Field>
      <FieldLabel>{{ phrase.backup_token }}</FieldLabel>
      <div class="flex flex-wrap items-center gap-xs">
        <span
          class="text-sm"
          :class="status?.configured ? 'text-text-1' : 'text-text-3'"
        >
          <Icon
            :name="status?.configured ? 'lock-close' : 'lock-open'"
            class="mr-1 text-text-3"
          />
          {{
            status?.configured
              ? phrase.backup_token_active
              : phrase.backup_token_missing
          }}
        </span>
        <Button :disabled="busy" @click="generate">
          {{
            status?.configured
              ? phrase.backup_token_regenerate
              : phrase.backup_token_generate
          }}
        </Button>
        <Button v-if="status?.configured" :disabled="busy" @click="revoke">
          {{ phrase.backup_token_revoke }}
        </Button>
        <!-- A plain anchor: TheiLink appends a trailing slash, which this
             API path does not have, and a download is not a route anyway. -->
        <a
          v-if="status?.configured"
          href="/api/admin/backup/script"
          download="thei-backup.mjs"
          class="text-sm text-accent underline-offset-2 hocus:underline"
        >
          <Icon name="upload" class="mr-1 rotate-180" />
          {{ phrase.backup_script_download }}
        </a>
      </div>
      <FieldHint>{{ phrase.backup_token_hint }}</FieldHint>
    </Field>

    <div
      v-if="freshToken"
      class="flex flex-col gap-xs rounded-normal border border-border-2 bg-bg-3
        p-xs"
    >
      <code class="scrollbar-mini overflow-x-auto text-sm break-all">{{
        freshToken
      }}</code>
      <p class="text-xs text-text-3">{{ phrase.backup_token_shown_once }}</p>
    </div>

    <p class="text-sm text-text-3">{{ phrase.backup_setup_hint }}</p>

    <div v-if="status?.recent.length" class="flex flex-col gap-1">
      <span class="text-sm text-text-2">{{ phrase.backup_history }}</span>
      <div
        v-for="item in status.recent"
        :key="item.backupUuid"
        class="flex flex-wrap items-baseline gap-x-xs text-xs text-text-3"
      >
        <TheiTime :datetime="item.completedAt" />
        <span>· {{ kindLabel(item.kind) }}</span>
        <span
          >·
          {{
            phrase.backup_run_summary(item.fileCount, humanSize(item.byteCount))
          }}</span
        >
        <span v-if="item.clientLabel">· {{ item.clientLabel }}</span>
      </div>
    </div>

    <p v-if="error" class="text-sm text-text-error">{{ error }}</p>
  </Box>
</template>
