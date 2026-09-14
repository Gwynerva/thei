<script lang="ts" setup>
import Icon from './Icon.vue';
import Media from './Media.vue';
import type { MediaDescriptor, MediaPlayback } from '#layers/thei/shared/media';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const isInteractive = computed(() => typeof attrs.onClick === 'function');

const props = withDefaults(
  defineProps<{
    media?: MediaDescriptor;
    extension?: string;
    selected?: boolean;
    shape?: 'normal' | 'circle';
    hoverAccentBorder?: boolean;
    playback?: MediaPlayback;
    loop?: boolean;
    autoplayReducedMotion?: boolean;
    engaged?: boolean;
    overlay?: {
      showVideo?: boolean;
      showSize?: boolean;
      showExtension?: boolean;
      size?: number;
      isPrivate?: boolean;
      editable?: boolean;
    };
  }>(),
  { shape: 'normal' },
);

const { engaged: interactionEngaged, events: mediaEvents } =
  useMediaInteraction();
const mediaEngaged = computed(
  () => interactionEngaged.value || Boolean(props.engaged),
);
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
    class="group relative isolate overflow-clip border-2 bg-bg-1
      transition-colors"
    :class="[
      { 'flex items-center justify-center': !media },
      shape === 'circle' ? 'rounded-full' : 'rounded-normal',
      hoverAccentBorder
        ? 'border-transparent hocus:border-accent'
        : 'border-border-1 hocus:border-border-3',
      selected
        ? `shadow-lg ring-2 shadow-accent/30 ring-accent ring-offset-2
          ring-offset-bg-3`
        : '',
    ]"
    v-on="mediaEvents"
    @keydown.enter="activateFromKeyboard"
    @keydown.space="activateFromKeyboard"
  >
    <Media
      v-if="media"
      :playback="playback ?? 'interaction'"
      :engaged="mediaEngaged"
      :loop
      :autoplay-reduced-motion
      v-bind="media"
      fit="contain"
      backdrop
      muted
      class="size-full"
    />
    <span v-else class="truncate p-1 text-center text-lg font-bold text-text-2">
      {{ extension?.toUpperCase() ?? '?' }}
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
    class="flex items-center justify-center overflow-clip border-2 bg-bg-1
      transition-colors hocus:bg-bg-3"
    :class="[
      shape === 'circle' ? 'rounded-full' : 'rounded-normal',
      hoverAccentBorder
        ? 'border-transparent hocus:border-accent'
        : 'border-border-1 hocus:border-border-3',
    ]"
    @keydown.enter="activateFromKeyboard"
    @keydown.space="activateFromKeyboard"
  >
    <Icon name="plus" class="text-3xl text-text-2" />
  </div>
</template>
