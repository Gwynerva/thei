<script lang="ts" setup>
import type { BlockFileChange } from '#layers/thei/shared/content-block-changes';
import ContentFileTile from '#layers/thei/app/components/content/ContentFileTile.vue';

/**
 * A block's files in a row, by their squares: those that stay as they are,
 * those that come marked with a plus, those that go struck — a picture
 * swapped or added is seen, not read about.
 */
const props = defineProps<{ files: BlockFileChange[] }>();

/** Squares a row shows before it counts the rest. */
const SHOWN = 8;
const shown = computed(() => props.files.slice(0, SHOWN));
const more = computed(() => props.files.length - shown.value.length);
const changeLabel = computed(() => ({
  same: '',
  added: phrase.value.ai_review_file_added,
  removed: phrase.value.ai_review_file_removed,
}));
</script>

<template>
  <ul class="flex flex-wrap items-center gap-1.5" data-review-files>
    <li
      v-for="(file, index) in shown"
      :key="`${file.asset.assetUuid}:${index}`"
      class="review-file relative rounded-sm"
      :data-change="file.change"
      :aria-label="changeLabel[file.change] || undefined"
      :data-title-popup="changeLabel[file.change] || undefined"
    >
      <ContentFileTile :asset="file.asset" small />
      <span
        v-if="file.change !== 'same'"
        class="absolute -top-1 -right-1 flex size-4.5 items-center
          justify-center rounded-full text-2xs"
        :class="
          file.change === 'added'
            ? 'bg-text-success text-bg-1'
            : 'bg-text-error text-bg-1'
        "
        aria-hidden="true"
        ><Icon :name="file.change === 'added' ? 'plus' : 'minus'"
      /></span>
    </li>
    <li v-if="more > 0" class="text-xs text-text-2 tabular-nums">
      +{{ more }}
    </li>
  </ul>
</template>

<style scoped>
.review-file[data-change='added'] {
  box-shadow: 0 0 0 2px var(--color-text-success);
}
.review-file[data-change='removed'] {
  box-shadow: 0 0 0 2px var(--color-text-error);
}
.review-file[data-change='removed'] > :first-child {
  opacity: 0.45;
  filter: grayscale(1);
}
</style>
