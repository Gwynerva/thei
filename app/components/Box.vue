<script lang="ts" setup>
import type { IconName } from '#thei/icons';

defineProps<{
  icon?: IconName;
  title?: string;
  description?: string;
}>();
</script>

<template>
  <div>
    <div
      class="mb-md flex flex-col gap-sm px-md align-top sm:flex-row
        sm:justify-between sm:px-0"
    >
      <div class="flex flex-col">
        <div
          class="flex flex-col items-center justify-center gap-sm text-lg
            font-semibold text-text-2 sm:flex-row sm:justify-start"
        >
          <Icon v-if="icon" :name="icon" class="text-[1.4em]" />
          <h2 v-if="title" class="text-center sm:text-left">{{ title }}</h2>
        </div>
        <p v-if="description" class="text-center text-text-3 sm:text-left">
          {{ description }}
        </p>
      </div>
      <slot name="actions"></slot>
    </div>
    <section
      class="relative border border-border-1 bg-bg-2 p-md shadow-md
        shadow-shadow-1 sm:rounded-lg"
    >
      <slot></slot>
    </section>
  </div>
</template>
