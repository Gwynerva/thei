<script lang="ts" setup>
import type { IconName } from '#thei/icons';

export type PublicSectionHeaderAction = {
  href: string;
  label: string;
  count?: number;
  icon?: IconName;
};

defineProps<{
  icon: IconName;
  title: string;
  headingId?: string;
  description?: string;
  action?: PublicSectionHeaderAction;
}>();
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-sm">
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2">
        <Icon :name="icon" class="shrink-0 text-xl text-text-3" />
        <h2 :id="headingId" class="min-w-0 text-lg font-semibold text-text-2">
          {{ title }}
        </h2>
      </div>
      <p v-if="description" class="mt-1 text-sm text-text-3">
        {{ description }}
      </p>
    </div>
    <TheiLink
      v-if="action"
      :to="action.href"
      class="inline-flex shrink-0 items-center gap-2 rounded-normal bg-bg-3
        px-sm py-xs text-sm font-semibold text-text-2 transition
        focus-visible:ring-2 focus-visible:ring-accent hocus:bg-accent/20
        hocus:text-accent"
    >
      <span>{{ action.label }}</span>
      <span v-if="action.count !== undefined" class="text-text-3 tabular-nums">
        {{ action.count }}
      </span>
      <Icon v-if="action.icon" :name="action.icon" />
    </TheiLink>
  </header>
</template>
