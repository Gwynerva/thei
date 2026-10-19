<script lang="ts" setup>
/**
 * A page of its own, or a PDF in the browser's viewer, framed in the
 * window. A page runs in a sandbox with an origin of no site: its scripts
 * work — a report may chart and sort — but they see no cookie of this site
 * and act as no one on it. `allow-same-origin` must never join the sandbox:
 * with scripts allowed, it would hand the page the owner's session.
 *
 * The frame stays unseen until its document is drawn: a frame is white
 * until then, which flashes in the dark theme. The document's ground and the
 * loading sign hold its place.
 */
const props = defineProps<{ html?: string; url?: string; title: string }>();

const PAGE_SANDBOX = [
  'allow-scripts',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-modals',
  'allow-forms',
  'allow-downloads',
].join(' ');

/**
 * A browser that never says its viewer has loaded still shows the frame,
 * only later.
 */
const SHOW_ANYWAY_MS = 4000;

const loaded = ref(false);
let showAnyway: ReturnType<typeof setTimeout> | undefined;

function wait() {
  loaded.value = false;
  clearTimeout(showAnyway);
  showAnyway = setTimeout(() => (loaded.value = true), SHOW_ANYWAY_MS);
}

function onLoad() {
  clearTimeout(showAnyway);
  loaded.value = true;
}

watch(() => [props.html, props.url], wait, { immediate: true });
onBeforeUnmount(() => clearTimeout(showAnyway));
</script>

<template>
  <div class="relative flex min-h-0 w-full flex-1 flex-col">
    <Transition
      leave-active-class="transition-opacity"
      leave-to-class="opacity-0"
    >
      <div
        v-if="!loaded"
        class="absolute inset-0 flex items-center justify-center rounded-normal
          border border-border-1 bg-bg-document text-text-3"
        data-file-preview-frame-loading
      >
        <Icon name="loading" class="size-8" />
      </div>
    </Transition>
    <!-- White beneath, as a page is written for: a page that sets no
         background would otherwise show the dark theme through. -->
    <iframe
      v-if="html !== undefined"
      :srcdoc="html"
      :sandbox="PAGE_SANDBOX"
      referrerpolicy="no-referrer"
      :aria-label="title"
      class="min-h-0 w-full flex-1 rounded-normal border border-border-1
        bg-white transition-opacity"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      data-file-preview-page
      @load="onLoad"
    ></iframe>
    <!-- The viewer draws its own ground. -->
    <iframe
      v-else
      :src="url"
      :aria-label="title"
      class="min-h-0 w-full flex-1 rounded-normal border border-border-1
        transition-opacity"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      data-file-preview-pdf
      @load="onLoad"
    ></iframe>
  </div>
</template>
