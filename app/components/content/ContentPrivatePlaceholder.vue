<script lang="ts" setup>
import type { ContentSummary } from '#layers/thei/shared/content';

defineProps<{ summary: ContentSummary }>();

// Picked once per placeholder; the seeded random keeps SSR and hydration equal.
const { randomArrayElement } = useRandom();
const joke = language.value.secretSummaries.length
  ? randomArrayElement(language.value.secretSummaries)
  : '';
</script>

<template>
  <section
    class="content-private-pattern content-private-placeholder relative isolate
      flex flex-col items-center gap-xs overflow-hidden rounded-normal border
      border-accent/20 bg-bg-accent/30 px-sm py-lg text-center"
  >
    <span
      class="inline-flex items-center gap-xs text-lg font-semibold text-accent"
    >
      <Icon name="lock-close" aria-hidden="true" />
      {{ phrase.content_private_section }}
    </span>
    <span v-if="joke" class="text-base font-semibold text-balance text-text-2">
      {{ joke }}
    </span>
    <ContentStats v-bind="summary" size="sm" class="mt-1 justify-center" />
  </section>
</template>

<style scoped>
.content-private-placeholder {
  --content-private-pattern-opacity: 0.035;
}
</style>
