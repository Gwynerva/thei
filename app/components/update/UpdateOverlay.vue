<script lang="ts" setup>
import type { UpdateOverlayMode } from '#layers/thei/app/composables/update-progress';

/**
 * The admin's full-screen update screen, like a router's: it opens when an
 * update or a restart starts, stays through the restart — it is already in
 * the browser, so the server may go away — and says how it ended.
 *
 * Mounted in `app.vue`, so it is part of the entry chunk. That matters: after
 * the swap the old build's lazy chunks are gone from disk, so nothing here may
 * load one, navigate, or open a modal.
 */
const {
  progress,
  screen,
  refresh,
  start,
  stop,
  expectRestart,
  retry: askRetry,
} = useUpdateProgress();
const request = useUpdateOverlayRequest();
const dialog = useTemplateRef('dialog');
const open = ref(false);
const mode = ref<UpdateOverlayMode>('update');
const busy = ref(false);
const actionError = ref<string>();
let documentOverflow: string | undefined;

// A plain restart shows no run: whatever the last update left is history.
const shown = computed(() =>
  mode.value === 'restart' && screen.value === 'failed-open'
    ? 'done'
    : screen.value,
);

async function show(next: UpdateOverlayMode) {
  mode.value = next;
  actionError.value = undefined;
  if (!open.value) {
    open.value = true;
    await nextTick();
    documentOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'clip';
    dialog.value?.showModal();
  }
  if (next === 'restart') expectRestart();
  else start();
}

/** The new build ships new client code: only a full reload shows it. */
function reloadPage() {
  window.location.reload();
}

function close() {
  stop();
  dialog.value?.close();
  open.value = false;
  document.documentElement.style.overflow = documentOverflow ?? '';
  // The page under the overlay shows the run as it ended.
  void refreshNuxtData('admin-updates');
}

async function retry() {
  if (busy.value) return;
  busy.value = true;
  actionError.value = await askRetry();
  busy.value = false;
}

watch(request, (next) => {
  if (!next) return;
  request.value = undefined;
  void show(next);
});

onMounted(async () => {
  // An update started elsewhere — another tab, another device — is followed
  // here too, from whatever page the admin opens.
  const current = await refresh();
  const status = current?.run?.status;
  if (status === 'running' || status === 'restarting') void show('update');
});
</script>

<template>
  <dialog
    ref="dialog"
    class="m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden border-0
      bg-bg-2 p-0 outline-none backdrop:bg-bg-1 sm:bg-bg-1"
    :aria-label="phrase.admin_updates"
    @cancel.prevent
    @keydown.esc.stop.prevent
  >
    <div
      v-if="open"
      class="flex h-full sm:items-center sm:justify-center sm:px-window
        sm:py-lg"
    >
      <UpdateScreen
        class="w-(--width-narrow)"
        :progress
        :screen="shown"
        :mode
        :busy
        :error="actionError"
        @continue="reloadPage"
        @close="close"
        @retry="retry"
      />
    </div>
  </dialog>
</template>
