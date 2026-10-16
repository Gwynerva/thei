<script lang="ts" setup>
import type { IconName } from '#thei/icons';

/**
 * The title row of a modal that fills the window — a file picker, the
 * library — and of the shell standing in for one, so the two line up.
 * Whatever the screen says beside its title goes in the default slot; on a
 * phone it goes under the title, which keeps the close button beside it.
 */
withDefaults(
  defineProps<{ icon?: IconName; title: string; closable?: boolean }>(),
  { closable: true },
);
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-md gap-y-xs">
    <h2
      class="flex min-w-0 flex-1 items-center gap-xs text-xl font-bold
        sm:flex-none"
    >
      <Icon v-if="icon" :name="icon" class="shrink-0" />
      <span class="truncate">{{ title }}</span>
    </h2>
    <div
      v-if="$slots.default"
      class="flex min-w-0 flex-wrap items-center gap-x-md gap-y-xs
        max-sm:order-last max-sm:basis-full sm:flex-1"
    >
      <slot></slot>
    </div>
    <!-- Without a close, the row keeps the height the button gives it. -->
    <button
      type="button"
      :aria-label="closable ? phrase.close_modal : undefined"
      :aria-hidden="closable ? undefined : true"
      :tabindex="closable ? undefined : -1"
      class="ml-auto shrink-0 cursor-pointer rounded-normal p-xs
        transition-colors hocus:bg-bg-3"
      :class="{ invisible: !closable }"
      @click="closeModal"
    >
      <Icon name="close" />
    </button>
  </div>
</template>
