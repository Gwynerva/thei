<script lang="ts" setup>
useHead({
  title: 'Thei',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
});

/**
 * What every page leads to while the site is closed for an update. The admin
 * sees how it is going, and why it stopped if it did; a visitor only that
 * the site is unavailable for now. Visitors are sent back to the site the
 * moment it opens; an admin first sees how the update ended.
 */
const {
  progress,
  screen,
  refresh,
  start,
  retry: askRetry,
} = useUpdateProgress();
const ready = ref(false);
const busy = ref(false);
const actionError = ref<string>();

watch(progress, (value) => {
  if (value?.site === 'open' && !value.admin) {
    window.location.replace(sitePath('/'));
  }
});

onMounted(async () => {
  await refresh();
  ready.value = true;
  start();
});

function openSite() {
  window.location.assign(sitePath('/admin/updates/'));
}

async function retry() {
  if (busy.value) return;
  busy.value = true;
  actionError.value = await askRetry();
  busy.value = false;
}
</script>

<template>
  <AdminGridWrapper>
    <div
      class="flex h-dvh sm:items-center sm:justify-center sm:px-window sm:py-lg"
    >
      <TransitionFade mode="out-in">
        <UpdateScreen
          v-if="ready && progress?.admin"
          class="w-(--width-narrow)"
          :progress
          :screen
          :busy
          :error="actionError"
          @continue="openSite"
          @retry="retry"
        />
        <UpdateUnavailable
          v-else-if="ready"
          class="m-auto w-(--width-narrow) max-sm:mx-window max-sm:w-auto"
        />
        <TheiLoadingIndicator v-else />
      </TransitionFade>
    </div>
  </AdminGridWrapper>
</template>
