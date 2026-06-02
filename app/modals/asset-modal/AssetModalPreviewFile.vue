<script lang="ts" setup>
import type { IconName } from '#thei/icons';

const { extension } = defineProps<{
  icon?: IconName;
  extension?: string;
}>();

const extensionData = computed(() => {
  if (!extension) {
    return;
  }

  let fontSize: string;
  switch (extension.length) {
    case 1:
      fontSize = '28cqw';
      break;
    case 2:
      fontSize = '24cqw';
      break;
    case 3:
      fontSize = '22cqw';
      break;
    case 4:
      fontSize = '18cqw';
      break;
    default:
      fontSize = '16cqw';
      break;
  }

  return {
    extension,
    fontSize,
  };
});
</script>

<template>
  <div class="@container relative aspect-square w-1/2 max-w-132 text-text-2">
    <Icon name="file" class="size-full" />
    <Icon
      v-if="icon"
      :name="icon"
      class="absolute top-1/2 left-1/2 size-[32cqw] -translate-x-1/2
        -translate-y-1/6"
    />
    <div
      v-if="extensionData"
      class="absolute top-1/2 left-1/2 max-w-[43cqw] -translate-x-1/2
        -translate-y-1/8 truncate font-mono text-(length:--extension-size)
        leading-none font-bold tracking-tight whitespace-nowrap uppercase"
      :style="{ '--extension-size': extensionData.fontSize }"
    >
      {{ extensionData.extension }}
    </div>
  </div>
</template>
