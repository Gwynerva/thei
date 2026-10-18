<script lang="ts" setup>
import type { AiValueChange } from '#layers/thei/app/composables/ai-change';

/**
 * One value's change in a card (`valueChange`): what goes struck, what comes
 * marked. A change that no longer stands to be made, or made, is told
 * quietly: the colours are for one that waits or holds (`live`).
 */
const props = defineProps<{ change: AiValueChange; live: boolean }>();

/** A word struck right before the one in its place stays apart from it. */
function gapBefore(index: number) {
  if (props.change.type !== 'words') return false;
  const before = props.change.pieces[index - 1];
  const part = props.change.pieces[index];
  return (
    before?.kind === 'removed' &&
    !/\s$/.test(before.text) &&
    !/^\s/.test(part?.text ?? '')
  );
}
</script>

<template>
  <span
    v-if="change.type === 'items'"
    class="inline-flex flex-wrap gap-1 align-top"
  >
    <span
      v-for="(item, index) in change.items"
      :key="index"
      class="rounded-sm px-1.5 leading-6"
      :class="
        item.kind === 'removed'
          ? live
            ? 'bg-bg-error text-text-error line-through decoration-1'
            : 'bg-bg-3 text-text-3 line-through decoration-1'
          : item.kind === 'added'
            ? live
              ? 'bg-bg-success font-medium text-text-success'
              : 'bg-bg-3 text-text-2'
            : 'bg-bg-3 text-text-2'
      "
      :data-change="item.kind"
      >{{ item.text }}</span
    >
  </span>
  <span v-else-if="change.type === 'words'"
    ><template v-for="(part, index) in change.pieces" :key="index"
      ><span
        v-if="part.kind === 'removed'"
        class="line-through decoration-1"
        :class="live ? 'text-text-error' : 'text-text-3'"
        data-change="removed"
        >{{ part.text }}</span
      ><span
        v-else-if="part.kind === 'added'"
        class="font-medium"
        :class="live ? 'text-text-success' : 'text-text-2'"
        data-change="added"
        >{{ gapBefore(index) ? ' ' : '' }}{{ part.text }}</span
      ><span v-else>{{ part.text }}</span></template
    ></span
  >
  <span v-else-if="change.type === 'whole'"
    ><template v-if="change.before"
      ><span
        class="line-through decoration-1"
        :class="live ? 'text-text-error' : 'text-text-3'"
        data-change="removed"
        >{{ change.before }}</span
      ><span class="mx-1 text-text-3">→</span></template
    ><span
      v-if="change.after"
      class="font-medium"
      :class="live ? 'text-text-success' : 'text-text-2'"
      data-change="added"
      >{{ change.after }}</span
    ><span v-else class="text-text-3 italic">{{
      phrase.ai_action_cleared
    }}</span></span
  >
</template>
