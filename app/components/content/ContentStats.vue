<script lang="ts" setup>
const { size = 'xs' } = defineProps<{
  blockCount: number;
  wordCount: number;
  assetCount: number;
  assetTotalSize: number;
  size?: 'xs' | 'sm';
}>();

const humanSize = useHumanSize();
const compactNumber = useCompactNumber();
</script>

<template>
  <span
    class="flex flex-wrap items-center gap-xs"
    :class="size === 'sm' ? 'text-sm' : 'text-xs'"
  >
    <span
      class="inline-flex cursor-help items-center gap-1 whitespace-nowrap
        text-text-3 transition-colors hocus:text-text-2"
      :data-title-popup="phrase.content_block_count(blockCount)"
    >
      <Icon name="blocks" />
      {{ blockCount }}
    </span>
    <span
      class="inline-flex cursor-help items-center gap-1 whitespace-nowrap
        text-text-3 transition-colors hocus:text-text-2"
      :data-title-popup="phrase.content_word_count(wordCount)"
    >
      <Icon name="text" />
      {{ compactNumber(wordCount) }}
    </span>
    <span
      class="inline-flex cursor-help items-center gap-1 whitespace-nowrap
        text-text-3 transition-colors hocus:text-text-2"
      :data-title-popup="phrase.content_file_count(assetCount)"
    >
      <Icon name="files" />
      {{ assetCount }} / {{ humanSize(assetTotalSize) }}
    </span>
  </span>
</template>
