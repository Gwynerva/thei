<script lang="ts" setup>
import type { IconName } from '#thei/icons';

/**
 * The square a Save becomes on a phone: its icon — a floppy disk — and a
 * check once all of the form is saved, so a pale square never has to be read
 * as «saved». Both stay in the page, one hidden: pointing an icon's `<use>`
 * elsewhere while the owner types in a text ends the browser's run of
 * typing, and Ctrl+Z would then stop after the first letter. Without `done`
 * there is no check at all.
 */
withDefaults(defineProps<{ icon?: IconName; done?: boolean }>(), {
  icon: 'save',
  // Without it Vue would read a missing `done` as false, and a square that
  // never says saved would carry a hidden check.
  done: undefined,
});
</script>

<template>
  <Icon :name="icon" class="shrink-0 sm:hidden" :class="{ hidden: done }" />
  <Icon
    v-if="done !== undefined"
    name="check"
    class="shrink-0 sm:hidden"
    :class="{ hidden: !done }"
  />
</template>
