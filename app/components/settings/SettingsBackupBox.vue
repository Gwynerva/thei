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

const scripts = computed(() => [
  {
    platform: 'windows',
    file: 'thei-backup.cmd',
    label: phrase.value.backup_script_windows,
  },
  {
    platform: 'unix',
    file: 'thei-backup.sh',
    label: phrase.value.backup_script_unix,
  },
]);

/**
 * Right after generating a token the script can carry it too. It is filled in
 * here rather than on the server, which never gets the token back.
 */
async function downloadScript(
  event: MouseEvent,
  script: { platform: string; file: string },
) {
  const token = freshToken.value;
  if (!token) return;
  event.preventDefault();
  try {
    const source = await $fetch<string>('/api/admin/backup/script', {
      query: { platform: script.platform },
      responseType: 'text',
    });
    const blob = new Blob([source.replace('__THEI_BACKUP_TOKEN__', token)], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = script.file;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
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
        <!-- Plain anchors: TheiLink appends a trailing slash, which this
             API path does not have, and a download is not a route anyway. -->
        <template v-if="status?.configured">
          <a
            v-for="script in scripts"
            :key="script.platform"
            :href="
              sitePath(`/api/admin/backup/script?platform=${script.platform}`)
            "
            :download="script.file"
            class="text-sm text-accent underline-offset-2 hocus:underline"
            @click="downloadScript($event, script)"
          >
            <Icon name="download" class="mr-1" />
            {{ script.label }}
          </a>
        </template>
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
