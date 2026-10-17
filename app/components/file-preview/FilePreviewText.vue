<script lang="ts" setup>
/**
 * A text as it is written, line for line, in a face where every letter is
 * as wide: a log, a list, a program, a note. Long lines wrap rather than
 * run off; only the start of a large file is shown, and says so.
 */
defineProps<{ text: string; shown: number; total: number }>();

const humanSize = useHumanSize();
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-normal border
      border-border-1 bg-bg-document"
  >
    <pre
      tabindex="0"
      data-own-arrows
      data-file-preview-text
      class="scrollbar-hover min-h-0 flex-1 overflow-auto p-sm font-mono text-sm
        leading-relaxed wrap-break-word whitespace-pre-wrap text-text-1
        outline-none"
      >{{ text }}</pre>
    <p
      v-if="shown < total"
      class="shrink-0 border-t border-border-1 px-sm py-xs text-xs text-text-3"
    >
      {{ phrase.file_preview_shown_part(humanSize(shown), humanSize(total)) }}
    </p>
  </div>
</template>
