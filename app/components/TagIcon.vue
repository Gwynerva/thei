<script lang="ts" setup>
import type { TagEditItem } from '#layers/thei/shared/tag';

defineOptions({ inheritAttrs: false });

const props = defineProps<{ tag: TagEditItem }>();

const iconMedia = computed(() =>
  'iconMedia' in props.tag ? props.tag.iconMedia : undefined,
);
</script>

<template>
  <span
    v-bind="$attrs"
    class="relative inline-flex shrink-0 items-center justify-center"
    :class="{
      'rounded-sm bg-bg-3 text-text-3': !iconMedia,
    }"
  >
    <Media v-if="iconMedia" v-bind="iconMedia" class="size-full" />
    <Icon v-else name="tag" />
  </span>
</template>
