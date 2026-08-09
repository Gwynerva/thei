<script lang="ts" setup>
defineProps<{
  blockCount: number;
  wordCount: number;
  assetCount: number;
  assetTotalSize: number;
}>();

const humanSize = useHumanSize();
const compactNumber = useCompactNumber();
</script>

<template>
  <span class="flex flex-wrap items-center gap-xs text-xs">
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
