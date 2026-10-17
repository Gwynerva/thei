<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import ModalHeaderButton from './ModalHeaderButton.vue';

/**
 * The title row of a modal that fills the window — a file picker, the
 * library — and of the shell standing in for one, so the two line up.
 * Whatever the screen says beside its title goes in the default slot; on a
 * phone it goes under the title, which keeps the close button beside it.
 * A title cut short is read whole in its hint.
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
      :data-title-popup="title"
      data-title-popup-clipped
    >
      <Icon v-if="icon" :name="icon" class="shrink-0" />
      <span class="truncate" data-title-popup-clip>{{ title }}</span>
    </h2>
    <div
      v-if="$slots.default"
      class="flex min-w-0 flex-wrap items-center gap-x-md gap-y-xs
        max-sm:order-last max-sm:basis-full sm:flex-1"
    >
      <slot></slot>
    </div>
    <ModalHeaderButton
      v-if="closable"
      icon="close"
      :label="phrase.close_modal"
      class="ml-auto"
      @click="closeModal"
    />
    <!-- Without a close, the row keeps the height the button gives it. -->
    <span v-else class="ml-auto h-9" aria-hidden="true"></span>
  </div>
</template>
