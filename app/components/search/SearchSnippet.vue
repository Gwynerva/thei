<script lang="ts" setup>
import type { SearchSegment } from '#layers/thei/shared/search/snippet';

/**
 * The words around a find, the found ones marked. They are the owner's text
 * and are formatted on their way out, as one text across the marks
 * (`formatSnippet`).
 */
const props = defineProps<{ segments: SearchSegment[] }>();

const pieces = computed(() => formatSnippet(props.segments));
</script>

<template>
  <span
    ><template v-for="(piece, at) in pieces" :key="at"
      ><mark
        v-if="piece.mark"
        class="rounded-xs bg-accent/20 box-decoration-clone px-px font-semibold
          text-text-1"
        >{{ piece.text }}</mark
      ><template v-else>{{ piece.text }}</template></template
    ></span
  >
</template>
