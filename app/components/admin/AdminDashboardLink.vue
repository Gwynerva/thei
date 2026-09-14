<script setup lang="ts">
import type { IconName } from '#thei/icons';

defineProps<{
  to: string;
  icon: IconName;
  title: string;
  description: string;
  count?: number;
}>();

const compactNumber = useCompactNumber();
</script>

<template>
  <TheiLink :to class="group">
    <Box class="h-full">
      <div class="flex h-full items-center justify-between gap-md p-md">
        <div class="flex min-w-0 items-center gap-sm">
          <span
            class="flex size-12 shrink-0 items-center justify-center
              rounded-normal bg-accent/20 text-xl text-accent transition
              group-hocus:bg-accent/30"
          >
            <Icon :name="icon" />
          </span>
          <div class="min-w-0">
            <p class="font-semibold transition group-hocus:text-accent">
              {{ title }}
            </p>
            <p class="text-sm text-text-3">{{ description }}</p>
          </div>
        </div>
        <span
          v-if="count !== undefined"
          class="shrink-0 text-2xl font-bold text-text-2"
          :title="count.toLocaleString()"
          :aria-label="count.toLocaleString()"
        >
          {{ compactNumber(count) }}
        </span>
      </div>
    </Box>
  </TheiLink>
</template>
