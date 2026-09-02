<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { MediaDescriptor } from '#layers/thei/shared/media';

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    href?: string;
    icon?: IconName;
    iconMedia?: MediaDescriptor;
    cornerIcon?: IconName;
    cornerTitle?: string;
    extension?: string;
    external?: boolean;
    button?: boolean;
  }>(),
  { icon: 'link' },
);
defineEmits<{ activate: [] }>();

const extensionFontSize = computed(() => {
  const length = props.extension?.length ?? 0;
  if (length <= 1) return '42cqw';
  if (length === 2) return '36cqw';
  if (length === 3) return '31cqw';
  if (length === 4) return '26cqw';
  return '22cqw';
});
</script>

<template>
  <component
    :is="button ? 'button' : href ? 'a' : 'div'"
    :href="!button ? href : undefined"
    :target="!button && external ? '_blank' : undefined"
    :rel="!button && external ? 'noopener noreferrer' : undefined"
    :type="button ? 'button' : undefined"
    class="group flex w-full min-w-0 items-center gap-xs rounded-sm px-1 py-1.5
      text-left text-text-1 no-underline transition focus-visible:ring-2
      focus-visible:ring-accent focus-visible:outline-none hocus:bg-bg-3/70"
    :class="{ 'cursor-pointer': button || href }"
    @click="button ? $emit('activate') : undefined"
  >
    <span
      class="@container relative flex size-8 shrink-0 items-center
        justify-center overflow-hidden rounded-sm text-text-3"
      :class="extension && !iconMedia ? 'bg-bg-3/70' : 'bg-bg-3'"
    >
      <Media v-if="iconMedia" v-bind="iconMedia" class="size-full" />
      <span
        v-else-if="extension"
        class="max-w-full truncate font-mono text-(length:--extension-size)
          leading-none font-bold tracking-tight whitespace-nowrap text-text-2
          uppercase"
        :style="{ '--extension-size': extensionFontSize }"
        aria-hidden="true"
      >
        {{ extension }}
      </span>
      <Icon v-else :name="icon" />
      <span
        v-if="cornerIcon"
        class="absolute right-0 bottom-0 z-2 flex size-4 cursor-help
          items-center justify-center rounded-tl-sm bg-bg-1 text-xs text-accent"
        :data-title-popup="cornerTitle"
      >
        <Icon :name="cornerIcon" />
      </span>
    </span>
    <span class="min-w-0 flex-1">
      <strong class="block truncate text-sm font-normal">{{ title }}</strong>
      <span v-if="description" class="line-clamp-1 block text-xs text-text-3">{{
        description
      }}</span>
    </span>
  </component>
</template>
