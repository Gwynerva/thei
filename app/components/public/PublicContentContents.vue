<script lang="ts" setup>
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';

defineProps<{ items: ContentHeading[] }>();
</script>

<template>
  <nav
    class="flex min-w-0 flex-col gap-xs"
    :aria-label="phrase.public_details_contents"
  >
    <a
      v-for="item in items"
      :key="item.path"
      :href="item.href"
      class="flex min-w-0 items-start gap-2 leading-snug break-words text-text-1
        transition focus-visible:rounded-sm focus-visible:ring-2
        focus-visible:ring-accent focus-visible:outline-none hocus:text-text-1
        hocus:underline"
      :class="item.level === 3 ? 'pl-sm text-xs' : 'text-sm'"
    >
      <span v-if="item.icon" class="flex h-lh shrink-0 items-center">
        <Icon :name="item.icon" class="text-text-3" aria-hidden="true" />
      </span>
      <span class="min-w-0">{{ publicText(item.title) }}</span>
    </a>
  </nav>
</template>
