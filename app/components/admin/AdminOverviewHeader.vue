<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { RouteLocationRaw } from 'vue-router';

/**
 * The head of a box on the dashboard, the same on every one: its icon and
 * title leading to the whole list, how many there are, and a "+" that starts
 * a new one.
 */
const props = defineProps<{
  icon: IconName;
  title: string;
  to: RouteLocationRaw;
  count: number;
  newTo: RouteLocationRaw;
  newLabel: string;
}>();

const compactNumber = useCompactNumber();
const exact = computed(() => props.count.toLocaleString(language.value.code));
</script>

<template>
  <div class="flex items-center justify-between gap-sm p-sm">
    <TheiLink :to class="group flex min-w-0 items-center gap-xs">
      <Icon
        :name="icon"
        class="shrink-0 text-xl text-text-2 transition
          group-hocus:text-accent/70"
      />
      <h2 class="truncate text-lg font-bold transition group-hocus:text-accent">
        {{ title }}
      </h2>
    </TheiLink>
    <div class="flex shrink-0 items-center gap-sm">
      <!-- Shortened, the whole number is in its hint. -->
      <span
        class="text-xl font-bold text-text-2"
        :aria-label="exact"
        :data-title-popup="exact !== compactNumber(count) ? exact : undefined"
        >{{ compactNumber(count) }}</span
      >
      <TheiLink
        :to="newTo"
        :aria-label="newLabel"
        :data-title-popup="newLabel"
        class="flex size-9 items-center justify-center rounded-full bg-accent/80
          text-white transition hocus:bg-accent"
      >
        <Icon name="plus" />
      </TheiLink>
    </div>
  </div>
</template>
