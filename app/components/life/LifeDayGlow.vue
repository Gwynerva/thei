<script lang="ts" setup>
/**
 * The glow along the rail of the day being read or pointed at.
 *
 * A day is several rows of the feed, each positioned at a fractional offset.
 * Drawn a slice per row, the soft edges of neighbouring slices show as seams,
 * so the feed draws it once over the whole day instead.
 */
const { warning, active, highlighted, fadeTop, fadeBottom } = defineProps<{
  warning: boolean;
  active: boolean;
  highlighted: boolean;
  /** The day's first and last rows are rendered, so its ends fade out. */
  fadeTop: boolean;
  fadeBottom: boolean;
}>();
</script>

<template>
  <div
    class="pointer-events-none flex w-8 justify-center sm:w-16"
    aria-hidden="true"
  >
    <span
      class="life-day-glow relative h-full w-10 transition-opacity duration-300
        motion-reduce:duration-0 sm:w-14"
      :class="[
        warning ? 'text-text-warning' : 'text-accent',
        active ? 'opacity-100' : highlighted ? 'opacity-60' : 'opacity-0',
        {
          'life-day-glow--top': fadeTop,
          'life-day-glow--bottom': fadeBottom,
        },
      ]"
    >
      <span
        class="life-day-glow-core absolute inset-y-0 left-1/2 w-0.5
          -translate-x-1/2 bg-current sm:w-1"
      ></span>
    </span>
  </div>
</template>

<style scoped>
.life-day-glow {
  --life-day-glow-top: black;
  --life-day-glow-bottom: black;
  background: linear-gradient(
    to right,
    transparent,
    color-mix(in oklab, currentColor 9%, transparent) 18%,
    color-mix(in oklab, currentColor 22%, transparent) 50%,
    color-mix(in oklab, currentColor 9%, transparent) 82%,
    transparent
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    var(--life-day-glow-top),
    black 1.5rem,
    black calc(100% - 1.5rem),
    var(--life-day-glow-bottom)
  );
  mask-image: linear-gradient(
    to bottom,
    var(--life-day-glow-top),
    black 1.5rem,
    black calc(100% - 1.5rem),
    var(--life-day-glow-bottom)
  );
}

.life-day-glow--top {
  --life-day-glow-top: transparent;
}

.life-day-glow--bottom {
  --life-day-glow-bottom: transparent;
}

.life-day-glow-core {
  box-shadow:
    0 0 0.26rem 0.06rem color-mix(in oklab, currentColor 42%, transparent),
    0 0 0.6rem 0.08rem color-mix(in oklab, currentColor 24%, transparent);
}
</style>
