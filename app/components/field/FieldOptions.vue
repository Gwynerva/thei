<script lang="ts" setup>
import type { IconName } from '#thei/icons';

export interface FieldOptionValue {
  icon?: IconName;
  title?: string;
  description?: string;
  classes?: string;
}

export type FieldOptions = Record<string, FieldOptionValue>;

const { direction = 'row' } = defineProps<{
  options: FieldOptions;
  direction?: 'row' | 'column';
}>();

const model = defineModel<string>();
</script>

<template>
  <div class="flex">
    <div
      class="flex gap-1 rounded-lg bg-bg-3 p-1 text-sm"
      :class="[direction === 'column' ? 'flex-1 flex-col' : '']"
    >
      <button
        v-for="(option, key) in options"
        :key
        @click="model = key"
        class="cursor-pointer rounded-lg border-2 transition"
        :class="[
          option.classes,
          model === key
            ? 'border-accent bg-bg-accent text-accent'
            : `border-border-1 bg-bg-1 text-text-2 hactive:border-border-3
              hactive:bg-bg-1 hactive:text-text-1`,
          direction === 'column'
            ? 'flex flex-col gap-2 p-md text-left'
            : 'p-sm',
        ]"
      >
        <div
          class="flex gap-2"
          :class="[
            direction === 'column'
              ? ''
              : 'flex-wrap items-center justify-center gap-y-1',
          ]"
        >
          <Icon v-if="option.icon" :name="option.icon" class="text-[1.4em]" />
          <span v-if="option.title" class="font-semibold">
            {{ option.title }}
          </span>
        </div>
        <p
          v-if="option.description && direction === 'column'"
          class="text-sm text-text-2"
        >
          {{ option.description }}
        </p>
      </button>
    </div>
  </div>
</template>
