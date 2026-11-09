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
    /** `danger` marks an asset that is about to be deleted. */
    tone?: 'default' | 'danger';
    playback?: MediaPlayback;
    loop?: boolean;
    autoplayReducedMotion?: boolean;
    engaged?: boolean;
    /** `false` marks a chosen tile by its ring and glow alone. */
    check?: boolean;
    overlay?: {
      showVideo?: boolean;
      showSize?: boolean;
      showExtension?: boolean;
      size?: number;
      isPrivate?: boolean;
      editable?: boolean;
      pendingDeletion?: boolean;
      inHistory?: boolean;
      heldByAi?: boolean;
      warning?: string;
    };
  }>(),
  // Unset unless the tile can be chosen: only then does it draw a check.
  { shape: 'normal', tone: 'default', selected: undefined, check: true },
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
      selected
        ? 'asset-tile-chosen border-accent'
        : tone === 'danger'
          ? 'border-border-error hocus:border-text-error'
          : hoverAccentBorder
            ? 'border-transparent hocus:border-accent'
            : 'border-border-1 hocus:border-border-3',
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
    <!-- A chosen tile of a choice says so in its middle: a check, white in
         either theme, on a darkened accent that lets the picture show
         through. A gallery's current tile has its ring alone. -->
    <span
      v-if="check && selected !== undefined"
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 z-30 grid place-items-center
        transition duration-250 motion-reduce:transition-none"
      :class="selected ? 'scale-100 opacity-100' : 'scale-75 opacity-0'"
    >
      <span
        class="asset-tile-check grid aspect-square w-2/5 max-w-12
          place-items-center rounded-full text-white"
        ><Icon name="check" class="text-2xl"
      /></span>
    </span>
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

<style scoped>
/* A chosen tile glows in the accent all round, beyond its ring. */
.asset-tile-chosen {
  box-shadow: 0 0 0.875rem 0.125rem
    color-mix(in oklab, var(--color-accent) 60%, transparent);
}
/* Dark enough under white in both themes, and still see-through. */
.asset-tile-check {
  background: color-mix(
    in oklab,
    color-mix(in oklab, var(--color-accent) 72%, black) 78%,
    transparent
  );
}
</style>
