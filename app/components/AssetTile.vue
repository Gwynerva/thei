<script lang="ts" setup>
import Icon from './Icon.vue';
import Media from './Media.vue';
import type { MediaDescriptor } from '#layers/thei/shared/media';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const isInteractive = computed(() => typeof attrs.onClick === 'function');

const props = withDefaults(
  defineProps<{
    media?: MediaDescriptor;
    extension?: string;
    selected?: boolean;
    overlay?: {
      showVideo?: boolean;
      showSize?: boolean;
      showExtension?: boolean;
      size?: number;
      isPrivate?: boolean;
      editable?: boolean;
    };
  }>(),
  {},
);

const mediaEl = useTemplateRef<InstanceType<typeof Media>>('mediaEl');
const canHoverPlay = computed(
  () =>
    props.media?.kind === 'video' &&
    (props.overlay?.size == null || props.overlay.size < 10 * 1024 * 1024),
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
    class="group relative isolate overflow-clip rounded-normal border-2
      border-border-1 bg-bg-1 transition-colors hocus:border-border-3"
    :class="[
      { 'flex items-center justify-center': !media },
      selected
        ? `shadow-lg ring-2 shadow-accent/30 ring-accent ring-offset-2
          ring-offset-bg-3`
        : '',
    ]"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @keydown.enter="activateFromKeyboard"
    @keydown.space="activateFromKeyboard"
  >
    <Media
      v-if="media"
      ref="mediaEl"
      v-bind="media"
      fit="contain"
      backdrop
      muted
      class="size-full"
    />
    <span v-else class="truncate p-1 text-center text-lg font-bold text-text-2">
      {{ extension!.toUpperCase() }}
    </span>

    <AssetTileOverlay
      v-if="overlay"
      :media-kind="media?.kind"
      :extension
      v-bind="overlay"
    />
    <slot name="overlay" />
  </div>

  <div
    v-else
    v-bind="attrs"
    :role="isInteractive ? 'button' : undefined"
    :tabindex="isInteractive ? 0 : undefined"
    class="flex items-center justify-center overflow-clip rounded-normal
      border-2 border-border-1 bg-bg-1 transition-colors hocus:border-border-3
      hocus:bg-bg-3"
    @keydown.enter="activateFromKeyboard"
    @keydown.space="activateFromKeyboard"
  >
    <Icon name="plus" class="text-3xl text-text-2" />
  </div>
</template>
