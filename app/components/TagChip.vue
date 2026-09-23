<script lang="ts" setup>
import { tagAccentCssColor, type TagEditItem } from '#layers/thei/shared/tag';

const props = defineProps<{
  tag: TagEditItem;
  interactive?: boolean;
  active?: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();

const iconMedia = computed(() =>
  'iconMedia' in props.tag ? props.tag.iconMedia : undefined,
);
const accentColor = computed(() =>
  tagAccentCssColor({ title: props.tag.title, iconMedia: iconMedia.value }),
);
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    class="tag-chip inline-flex h-8 max-w-full items-center gap-2 rounded-sm
      border border-border-1 px-xs text-xs leading-none font-semibold
      text-text-1 transition"
    :class="{
      'cursor-pointer': interactive,
      'ring-2 ring-accent ring-offset-1 ring-offset-bg-2': active,
    }"
    :style="{ '--tag-accent': accentColor }"
    @click="emit('click')"
  >
    <TagIcon
      v-if="iconMedia"
      :tag="tag"
      class="aspect-square h-4/6 shrink-0 rounded-xs"
    />
    <span class="min-w-0 truncate">{{ tag.title }}</span>
    <slot />
  </component>
</template>

<style scoped>
/*
 * The same treatment as an external link chip: the accent sits under the icon
 * on the left and fades out to the ordinary surface, so a row of chips reads
 * as one family rather than a row of coloured blocks.
 */
.tag-chip {
  position: relative;
  overflow: hidden;
  background: linear-gradient(
    90deg,
    color-mix(in oklab, var(--tag-accent) 16%, var(--color-bg-3)) 0%,
    var(--color-bg-3) 72%
  );
}

.tag-chip::before {
  position: absolute;
  z-index: 0;
  inset: 0;
  background: linear-gradient(
    90deg,
    color-mix(in oklab, var(--tag-accent) 16%, var(--color-bg-3)) 0%,
    color-mix(in oklab, var(--tag-accent) 8%, var(--color-bg-3)) 72%
  );
  content: '';
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms ease;
}

.tag-chip > * {
  position: relative;
  z-index: 1;
}

.tag-chip:is(:hover, :focus-visible) {
  border-color: color-mix(in oklab, var(--tag-accent) 80%, transparent);
}

.tag-chip:is(:hover, :focus-visible)::before {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .tag-chip::before {
    transition: none;
  }
}
</style>
