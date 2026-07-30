<script lang="ts" setup>
import type { TagEditItem } from '#layers/thei/shared/tag';

const props = defineProps<{
  tag: TagEditItem;
  interactive?: boolean;
  active?: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();

const accentColor = computed(() =>
  'accentColor' in props.tag && props.tag.accentColor
    ? props.tag.accentColor
    : 'var(--color-text-3)',
);
const iconMedia = computed(() =>
  'iconMedia' in props.tag ? props.tag.iconMedia : undefined,
);
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    class="tag-chip inline-flex h-8 max-w-full items-center gap-2 rounded-sm
      px-xs text-xs leading-none font-semibold transition"
    :class="{
      'cursor-pointer hocus:brightness-110': interactive,
      'ring-2 ring-accent ring-offset-1 ring-offset-bg-2': active,
    }"
    :style="{ '--tag-accent': accentColor }"
    @click="emit('click')"
  >
    <TagIcon v-if="iconMedia" :tag="tag" class="aspect-square h-4/6" />
    <span class="truncate">{{ tag.title }}</span>
    <slot />
  </component>
</template>

<style scoped>
.tag-chip {
  color: var(--color-text-1);
  background: color-mix(in oklab, var(--tag-accent) 20%, var(--color-bg-3));
  border: 1px solid
    color-mix(in oklab, var(--tag-accent) 28%, var(--color-border-1));
}
</style>
