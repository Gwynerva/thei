<script lang="ts" setup>
import type {
  UpdateProgress,
  UpdateScreenState,
} from '#layers/thei/shared/api/update-progress';
import type { IconName } from '#thei/icons';
import type { UpdateOverlayMode } from '#layers/thei/app/composables/update-progress';

/**
 * How an update is going, as the full-screen overlay and the closed site's
 * update page both show it. Display only: the caller polls and acts.
 *
 * Fills at most the height its parent gives it: the heading and the actions
 * stay in place, and a long list of steps scrolls between them, following the
 * step that is running. On a phone it takes the whole screen, like a modal.
 */
const {
  progress,
  screen,
  mode = 'update',
  busy = false,
  error,
} = defineProps<{
  progress: UpdateProgress | undefined;
  screen: UpdateScreenState;
  mode?: UpdateOverlayMode;
  busy?: boolean;
  /** An action that did not go through. */
  error?: string;
}>();

const emit = defineEmits<{
  continue: [];
  close: [];
  retry: [];
}>();

const run = computed(() => progress?.run);
const siteClosed = computed(
  () => progress?.site === 'updating' || progress?.site === 'failed',
);
// A plain restart has no steps of its own; a closed site means the restart
// found update work left, and that is shown like any update.
const restartOnly = computed(() => mode === 'restart' && !siteClosed.value);

const title = computed(() => {
  switch (screen) {
    case 'done':
      return restartOnly.value
        ? phrase.value.update_restarted
        : phrase.value.update_done_x(progress?.version ?? '');
    case 'failed':
      return phrase.value.boot_update_title;
    case 'failed-open':
      return phrase.value.update_failed_title;
    default:
      if (restartOnly.value) return phrase.value.update_status_restarting;
      return run.value
        ? phrase.value.update_title_x(run.value.toVersion)
        : phrase.value.update_in_progress;
  }
});

const icon = computed<{ name: IconName; class: string }>(() => {
  if (screen === 'done') return { name: 'check', class: 'text-accent' };
  if (screen === 'failed' || screen === 'failed-open')
    return { name: 'warning', class: 'text-text-error' };
  return { name: 'loading', class: 'text-accent' };
});

const note = computed(() => {
  switch (screen) {
    case 'offline':
      return restartOnly.value
        ? phrase.value.update_restart_pending
        : phrase.value.update_waiting;
    case 'progress':
      return siteClosed.value ? phrase.value.update_site_closed : undefined;
    case 'failed':
      switch (progress?.failure?.reason) {
        case 'migration-failed':
          return phrase.value.boot_update_migration_failed;
        case 'task-failed':
          return phrase.value.boot_update_task_failed;
        case 'downgrade':
          return phrase.value.boot_update_downgrade;
        default:
          return phrase.value.boot_update_error;
      }
    case 'failed-open':
      return phrase.value.update_failed_hint;
    default:
      return undefined;
  }
});

const versions = computed(() =>
  run.value && !restartOnly.value
    ? `${run.value.fromVersion} → ${run.value.toVersion}`
    : undefined,
);

const steps = computed(() =>
  restartOnly.value ? [] : (run.value?.steps ?? []),
);

const stepList = useTemplateRef('stepList');

watch(
  () => steps.value.find((step) => step.status === 'running')?.id,
  async (id) => {
    if (!id) return;
    await nextTick();
    stepList.value
      ?.querySelector('[data-update-step="running"]')
      ?.scrollIntoView({ block: 'nearest' });
  },
  { immediate: true },
);

const action = computed(() => {
  if (screen === 'done') return 'continue';
  if (screen === 'failed-open') return 'close';
  if (screen === 'failed' && progress?.canRetry) return 'retry';
  return undefined;
});

const failureMessage = computed(() => {
  if (screen === 'failed')
    return progress?.failure?.message ?? run.value?.error;
  if (screen === 'failed-open') return run.value?.error;
  return undefined;
});
</script>

<template>
  <section
    class="flex h-full max-h-full flex-col overflow-hidden border-border-1
      bg-bg-2 shadow-shadow-2 sm:h-auto sm:rounded-normal sm:border
      sm:shadow-xl"
  >
    <div class="flex shrink-0 flex-col gap-xs p-md" role="status">
      <h1 class="flex items-center gap-xs text-xl font-bold">
        <Icon :name="icon.name" class="shrink-0" :class="icon.class" />
        <span class="min-w-0">{{ title }}</span>
      </h1>
      <p v-if="versions" class="text-sm text-text-3 tabular-nums">
        {{ versions }}
      </p>
      <p v-if="note" class="text-text-2">{{ note }}</p>
    </div>

    <div
      v-if="steps.length"
      ref="stepList"
      class="min-h-0 grow overflow-y-auto overscroll-contain border-t
        border-border-1 px-md py-sm"
    >
      <UpdateSteps :steps="steps" />
    </div>

    <p
      v-if="failureMessage"
      class="max-h-32 shrink-0 overflow-y-auto border-t border-border-error
        bg-bg-error px-md py-sm text-sm break-words text-text-error"
    >
      {{ failureMessage }}
    </p>

    <div
      v-if="
        screen === 'done' || screen === 'failed' || screen === 'failed-open'
      "
      class="flex shrink-0 flex-col gap-sm border-t border-border-1 px-md py-sm"
    >
      <p v-if="screen === 'failed'" class="text-sm text-text-3">
        {{
          progress?.canRetry
            ? phrase.update_retry_hint
            : phrase.boot_update_hint
        }}
      </p>

      <p v-if="error" class="text-sm break-words text-text-error">
        {{ error }}
      </p>

      <div v-if="action" class="flex flex-wrap gap-sm">
        <Button v-if="action === 'continue'" @click="emit('continue')">
          {{ phrase.update_continue }}
        </Button>
        <Button
          v-else-if="action === 'retry'"
          :disabled="busy"
          @click="emit('retry')"
        >
          <Icon name="refresh" class="mr-xs" />{{ phrase.update_retry }}
        </Button>
        <Button v-else variant="secondary" @click="emit('close')">
          {{ phrase.update_close }}
        </Button>
      </div>
    </div>
  </section>
</template>
