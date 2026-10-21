<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import { useFieldLabelName } from './field-label';

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
  classes?: string;
}>();

const model = defineModel<string>();
/** The field's label: what the group of options is called. */
const labelledBy = useFieldLabelName();
</script>

<!-- Each option is a button pressed while chosen, named by its words; inside
     it only what a button may hold, so its name is read the same way by
     anything that reads the page. -->
<template>
  <div class="flex">
    <div
      class="flex flex-wrap gap-1 rounded-normal bg-bg-3 p-1 text-sm"
      :class="[direction === 'column' ? 'flex-1 flex-col' : '', classes]"
      :role="labelledBy ? 'group' : undefined"
      :aria-labelledby="labelledBy"
    >
      <button
        v-for="(option, key) in options"
        :key
        type="button"
        :aria-pressed="model === key"
        :aria-label="option.title"
        :aria-description="
          direction === 'column' ? option.description : undefined
        "
        @click="model = key"
        :data-title-popup="direction === 'row' ? option.description : undefined"
        class="cursor-pointer rounded-normal border-2 p-xs transition"
        :class="[
          direction === 'column' ? 'flex-1' : 'flex-auto',
          option.classes,
          model === key
            ? 'border-accent bg-bg-accent text-accent'
            : `border-border-1 bg-bg-1 text-text-2 hocus:border-border-3
              hocus:bg-bg-1 hocus:text-text-1`,
          direction === 'column' ? 'flex flex-col gap-2 text-left' : '',
        ]"
      >
        <span
          class="flex gap-2"
          :class="[
            direction === 'column'
              ? ''
              : 'flex-wrap items-center justify-center gap-y-1',
          ]"
        >
          <Icon v-if="option.icon" :name="option.icon" aria-hidden="true" />
          <span v-if="option.title" class="font-semibold">
            {{ option.title }}
          </span>
        </span>
        <span
          v-if="option.description && direction === 'column'"
          class="block text-sm text-text-2"
        >
          {{ option.description }}
        </span>
      </button>
    </div>
  </div>
</template>
