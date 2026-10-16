<script lang="ts" setup>
/**
 * A page of its own, or a PDF in the browser's viewer, framed in the
 * window. A page runs in a sandbox with an origin of no site: its scripts
 * work — a report may chart and sort — but they see no cookie of this site
 * and act as no one on it. `allow-same-origin` must never join the sandbox:
 * with scripts allowed, it would hand the page the owner's session.
 */
defineProps<{ html?: string; url?: string; title: string }>();

const PAGE_SANDBOX = [
  'allow-scripts',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-modals',
  'allow-forms',
  'allow-downloads',
].join(' ');
</script>

<template>
  <!-- White beneath, as a page is written for: a page that sets no
       background would otherwise show the dark theme through. -->
  <iframe
    v-if="html !== undefined"
    :srcdoc="html"
    :sandbox="PAGE_SANDBOX"
    referrerpolicy="no-referrer"
    :aria-label="title"
    class="min-h-0 w-full flex-1 rounded-normal border border-border-1 bg-white"
    data-file-preview-page
  ></iframe>
  <iframe
    v-else
    :src="url"
    :aria-label="title"
    class="min-h-0 w-full flex-1 rounded-normal border border-border-1 bg-white"
    data-file-preview-pdf
  ></iframe>
</template>
