<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue';
import { mediaSurfaceProps } from './media-props';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import { useMediaPair } from '#layers/thei/app/composables/media-pair';

const props = defineProps(mediaSurfaceProps);
const emit = defineEmits<{
  dimensions: [width: number, height: number];
  ready: [];
  error: [];
}>();
const root = useTemplateRef<HTMLElement>('root');
const {
  active,
  generation,
  requested,
  revealed,
  previewRevealed,
  previewWanted,
  previewSrc,
  loading,
  phase,
  previewPhase,
  ratio,
  status,
  register,
  events,
  play,
  pause,
} = useMediaPair(props, root, (width, height) =>
  emit('dimensions', width, height),
);
const style = computed(() => ({
  '--media-accent': imageAccentCssColor(props.accent, 'var(--color-bg-3)'),
  '--media-ratio': ratio.value,
}));
const fallbackBackdrop = computed(
  () =>
    revealed.value &&
    status.backdrop === 'error' &&
    status.previewBackdrop === 'ready',
);
const visualReady = computed(
  () =>
    (revealed.value && status.main !== 'error') ||
    (previewWanted.value && previewRevealed.value) ||
    fallbackBackdrop.value,
);
const pulseVisible = ref(false);
let pulseTimer: ReturnType<typeof setTimeout> | undefined;
const PULSE_DELAY = 350;

watch(loading, (value) => {
  clearTimeout(pulseTimer);
  pulseTimer = undefined;
  if (!value) {
    pulseVisible.value = false;
    return;
  }
  pulseTimer = setTimeout(() => {
    pulseVisible.value = true;
    pulseTimer = undefined;
  }, PULSE_DELAY);
});

watch(visualReady, (value) => {
  if (value) emit('ready');
});
watch(phase, (value) => {
  if (value === 'error' && !visualReady.value) emit('error');
});

onBeforeUnmount(() => clearTimeout(pulseTimer));
defineExpose({ play, pause });
</script>

<template>
  <div
    ref="root"
    class="media-surface relative isolate overflow-hidden"
    :style
    :data-media-active="active"
    :data-media-final-state="phase"
    :data-media-preview-state="previewPhase"
    data-mutation-free="true"
  >
    <div
      v-if="active && previewSrc"
      :key="`preview:${generation}`"
      class="media-pair pointer-events-none absolute inset-0 opacity-0
        transition-opacity duration-300 motion-reduce:duration-150"
      :class="{
        'opacity-100': (previewWanted && previewRevealed) || fallbackBackdrop,
      }"
      data-media-preview-pair
      aria-hidden="true"
    >
      <img
        v-if="backdrop"
        :ref="
          (el: Element | ComponentPublicInstance | null) =>
            register('previewBackdrop', el)
        "
        :src="previewSrc"
        class="media-backdrop pointer-events-none absolute max-w-none
          object-cover opacity-70 blur-3xl"
        alt=""
        draggable="false"
        v-on="events('previewBackdrop')"
      />
      <div
        v-show="!fallbackBackdrop"
        class="media-foreground absolute inset-0"
        data-media-foreground
      >
        <img
          :ref="
            (el: Element | ComponentPublicInstance | null) =>
              register('preview', el)
          "
          :src="previewSrc"
          class="media-main absolute inset-0 size-full"
          alt=""
          draggable="false"
          v-on="events('preview')"
        />
      </div>
    </div>
    <div
      v-if="active && requested"
      :key="`original:${generation}`"
      class="media-pair absolute inset-0 opacity-0 transition-opacity
        duration-300 motion-reduce:duration-150"
      :class="{ 'opacity-100': revealed && status.main !== 'error' }"
      :inert="!revealed"
      data-media-original-pair
    >
      <component
        :is="kind === 'video' ? 'video' : 'img'"
        v-if="backdrop && status.backdrop !== 'error'"
        :ref="
          (el: Element | ComponentPublicInstance | null) =>
            register('backdrop', el)
        "
        :src
        :muted="kind === 'video' ? true : undefined"
        :loop="kind === 'video' ? loop : undefined"
        :playsinline="kind === 'video' ? true : undefined"
        :preload="kind === 'video' ? 'auto' : undefined"
        :tabindex="kind === 'video' ? -1 : undefined"
        :data-media-backdrop-video="kind === 'video' ? '' : undefined"
        class="media-backdrop pointer-events-none absolute max-w-none
          object-cover opacity-70 blur-3xl"
        alt=""
        draggable="false"
        aria-hidden="true"
        v-on="events('backdrop')"
      />
      <div class="media-foreground absolute inset-0" data-media-foreground>
        <component
          :is="kind === 'video' ? 'video' : 'img'"
          :ref="
            (el: Element | ComponentPublicInstance | null) =>
              register('main', el)
          "
          :src
          :width
          :height
          :alt
          :muted="
            kind === 'video'
              ? muted || playback === 'autoplay' || playback === 'interaction'
              : undefined
          "
          :loop="kind === 'video' ? loop : undefined"
          :controls="kind === 'video' ? controls : undefined"
          :playsinline="kind === 'video' ? true : undefined"
          :preload="kind === 'video' ? 'auto' : undefined"
          class="media-main absolute inset-0 size-full"
          data-media-main
          draggable="false"
          v-on="events('main')"
        />
      </div>
    </div>
    <span
      class="media-loading pointer-events-none absolute inset-0 opacity-0
        transition-opacity duration-300 motion-reduce:duration-150"
      :class="{ 'opacity-100': pulseVisible }"
      data-media-loading
      aria-hidden="true"
    >
      <span
        class="media-loading-pulse absolute inset-0 bg-(--media-accent)"
        :style="{ animationPlayState: pulseVisible ? 'running' : 'paused' }"
      />
    </span>
  </div>
</template>

<style scoped>
.media-backdrop {
  /* Keep the transparent fringe of the filter beyond the clipped frame. */
  inset: calc(-3 * var(--blur-3xl));
  width: calc(100% + 6 * var(--blur-3xl));
  height: calc(100% + 6 * var(--blur-3xl));
}
.media-loading-pulse {
  animation: media-pulse 1.15s ease-in-out infinite alternate;
}
@starting-style {
  .media-loading {
    opacity: 0;
  }
}
@keyframes media-pulse {
  from {
    filter: brightness(0.88);
  }
  to {
    filter: brightness(1.12);
  }
}
@media (prefers-reduced-motion: reduce) {
  .media-loading-pulse {
    animation: none;
  }
}
</style>
