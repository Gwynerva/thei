<script lang="ts" setup>
import type { SearchSegment } from '#layers/thei/shared/search/snippet';

/**
 * The words around a find, the found ones marked. Each piece is the owner's
 * text and is formatted on its way out; its edges are kept as they are, for
 * the spaces between the pieces belong to the snippet.
 */
defineProps<{ segments: SearchSegment[] }>();

function formatted(text: string) {
  const lead = /^\s*/u.exec(text)![0];
  if (lead.length === text.length) return text;
  const tail = /\s*$/u.exec(text)![0];
  return (
    lead + publicText(text.slice(lead.length, text.length - tail.length)) + tail
  );
}
</script>

<template>
  <span
    ><template v-for="(segment, at) in segments" :key="at"
      ><mark
        v-if="segment.mark"
        class="rounded-xs bg-accent/20 box-decoration-clone px-px font-semibold
          text-text-1"
        >{{ formatted(segment.text) }}</mark
      ><template v-else>{{ formatted(segment.text) }}</template></template
    ></span
  >
</template>
