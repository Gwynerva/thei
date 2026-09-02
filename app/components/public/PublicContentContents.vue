<script lang="ts" setup>
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';

defineProps<{ items: ContentHeading[] }>();
const emit = defineEmits<{
  navigate: [id: string, event: MouseEvent];
}>();
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
      class="block min-w-0 leading-snug break-words text-text-1 transition
        focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none hocus:text-text-1 hocus:underline"
      :class="item.level === 3 ? 'pl-sm text-xs' : 'text-sm'"
      @click="emit('navigate', item.id, $event)"
    >
      {{ item.title }}
    </a>
  </nav>
</template>
