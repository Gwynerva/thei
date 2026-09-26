<script lang="ts" setup>
import { startSpoilerParticles } from './content-spoiler-particles';

/**
 * Hides one block until the reader asks for it.
 *
 * Renders nothing of its own when the block is not a spoiler — the slot goes
 * straight through, so the rhythm between blocks is the same either way.
 *
 * While hidden, the content is blurred, `inert` and covered by a button that
 * draws the dust; nothing inside can be read, focused or clicked. Revealing
 * removes the button altogether, so a link or a video inside gets its keys
 * and clicks back untouched.
 */
const props = defineProps<{ spoiler?: boolean }>();

const revealed = ref(false);
const hidden = computed(() => props.spoiler && !revealed.value);
const root = useTemplateRef<HTMLElement>('root');
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
let stopParticles: (() => void) | undefined;

function reveal() {
  revealed.value = true;
}

// The dust lives exactly as long as its canvas: it starts when the cover is
// mounted and stops once the cover has faded out and is gone.
watch(
  canvas,
  (element) => {
    stopParticles?.();
    stopParticles = undefined;
    if (element && root.value)
      stopParticles = startSpoilerParticles(element, root.value);
  },
  { flush: 'post' },
);

onBeforeUnmount(() => {
  stopParticles?.();
  stopParticles = undefined;
});
</script>

<template>
  <div
    v-if="spoiler"
    ref="root"
    class="content-spoiler"
    :data-revealed="hidden ? 'false' : 'true'"
  >
    <div
      class="content-spoiler__content"
      :inert="hidden || undefined"
      :aria-hidden="hidden || undefined"
    >
      <slot></slot>
    </div>
    <Transition name="content-spoiler-cover">
      <button
        v-if="hidden"
        type="button"
        class="content-spoiler__cover"
        :aria-label="phrase.content_spoiler_reveal"
        @click="reveal"
      >
        <canvas ref="canvas" aria-hidden="true"></canvas>
      </button>
    </Transition>
  </div>
  <slot v-else></slot>
</template>
