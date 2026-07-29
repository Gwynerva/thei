<script lang="ts" setup>
import Icon from './Icon.vue';
import Media from './Media.vue';
import { useHumanSize } from '../composables/human-size';
import type { MediaDescriptor } from '#layers/thei/shared/media';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const isInteractive = computed(() => typeof attrs.onClick === 'function');

const props = withDefaults(
  defineProps<{
    media?: MediaDescriptor;
    size?: number;
    isPrivate?: boolean;
    extension?: string;
    showExtension?: boolean;
  }>(),
  {
    showExtension: false,
  },
);

const formatSize = useHumanSize();
const mediaEl = useTemplateRef<InstanceType<typeof Media>>('mediaEl');
const canHoverPlay = computed(
  () =>
    props.media?.kind === 'video' &&
    (props.size == null || props.size < 10 * 1024 * 1024),
);

function onPointerEnter(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  if (canHoverPlay.value) void mediaEl.value?.play();
}

function onPointerLeave() {
  mediaEl.value?.pause();
}

function activateFromKeyboard(event: KeyboardEvent) {
  if (!isInteractive.value) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).click();
}
</script>

<template>
  <div
    v-if="media || extension"
    v-bind="attrs"
    :role="isInteractive ? 'button' : undefined"
    :tabindex="isInteractive ? 0 : undefined"
    class="group relative overflow-clip rounded-normal border-2 border-border-1
      bg-bg-1 transition hocus:border-border-3"
    :class="{
      'flex items-center justify-center': !media,
    }"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @keydown.enter="activateFromKeyboard"
    @keydown.space="activateFromKeyboard"
  >
    <Media
      v-if="media"
      ref="mediaEl"
      v-bind="media"
      class="size-full"
    />
    <span v-else class="truncate p-1 text-center text-lg font-bold text-text-2">
      {{ extension!.toUpperCase() }}
    </span>

    <div
      v-if="isPrivate"
      class="absolute top-1 left-1 select-none rounded-full bg-black/30 p-1 text-xs
        text-white backdrop-blur-sm"
    >
      <Icon name="lock-close" />
    </div>

    <div
      v-if="media?.kind === 'video'"
      class="absolute top-1 right-1 select-none rounded-full bg-black/30 p-1 text-xs
        leading-none text-white backdrop-blur-sm"
    >
      <Icon name="play-circle" />
    </div>

    <div
      v-if="size != null"
      class="absolute bottom-1 left-1/2 -translate-x-1/2 select-none rounded
        bg-black/30 p-1 text-xs leading-none whitespace-nowrap text-white
        backdrop-blur-sm"
    >
      {{ formatSize(size) }}
    </div>

    <div
      v-else-if="showExtension && extension"
      class="absolute right-1 bottom-1 select-none rounded bg-black/30 px-1 py-0.5
        text-xs leading-none text-white uppercase backdrop-blur-sm"
    >
      {{ extension }}
    </div>

    <div
      v-if="isInteractive"
      class="pointer-events-none absolute inset-0 flex select-none items-center
        justify-center bg-bg-1/60 opacity-0 transition group-hocus:opacity-100"
    >
      <Icon name="edit" class="text-2xl text-text-1" />
    </div>
  </div>

  <div
    v-else
    v-bind="attrs"
    :role="isInteractive ? 'button' : undefined"
    :tabindex="isInteractive ? 0 : undefined"
    class="flex items-center justify-center overflow-clip rounded-normal
      border-2 border-border-1 bg-bg-1 transition hocus:border-border-3
      hocus:bg-bg-3"
    @keydown.enter="activateFromKeyboard"
    @keydown.space="activateFromKeyboard"
  >
    <Icon name="plus" class="text-3xl text-text-2" />
  </div>
</template>
