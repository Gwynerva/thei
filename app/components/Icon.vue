<script lang="ts" setup>
import { iconsHref, iconNames, type IconName } from '#thei/icons';

const { name } = defineProps<{ name: IconName }>();

const href = computed(() => {
  const isKnownIcon = iconNames.includes(name);

  if (!isKnownIcon) {
    console.warn(`[thei] Icon "${name}" not found in bundled icons!`);
  }

  return `${iconsHref}#${isKnownIcon ? name : 'missing'}`;
});
</script>

<template>
  <svg thei-icon thei-icon-bundle width="1em" height="1em" fill="currentColor">
    <use :href></use>
  </svg>
</template>
