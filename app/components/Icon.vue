<script lang="ts" setup>
import { iconNames, type IconName } from '#thei/icons';
import { iconSpriteHref } from '../composables/icon-sprite';

const { name } = defineProps<{ name: IconName }>();

const href = computed(() => {
  const isKnownIcon = iconNames.includes(name);

  if (!isKnownIcon) {
    console.warn(`[thei] Icon "${name}" not found in bundled icons!`);
  }

  return iconSpriteHref(isKnownIcon ? name : 'missing');
});
</script>

<template>
  <svg
    thei-icon
    thei-icon-bundle
    width="1.25em"
    height="1.25em"
    fill="currentColor"
  >
    <use :href></use>
  </svg>
</template>
