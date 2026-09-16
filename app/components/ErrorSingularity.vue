<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import { ERROR_FALLBACK_ICON } from '#layers/thei/app/composables/error-view';

/**
 * An error drawn as a singularity: the central icon sits in a glowing core
 * while debris icons spiral into it, wobbling on the way.
 */
const props = defineProps<{
  icon?: IconName;
  debris?: IconName[];
}>();

const GOLDEN_ANGLE = 137.508;

// Derived from the index only, so the server and the client render the same
// layout and hydration stays quiet.
const pieces = computed(() =>
  (props.debris ?? []).map((name, index) => ({
    name,
    style: {
      '--debris-angle': `${((index * GOLDEN_ANGLE) % 360).toFixed(1)}deg`,
      '--debris-distance': (0.72 + ((index * 7) % 5) * 0.065).toFixed(3),
      '--debris-size': `${(1.1 + ((index * 3) % 4) * 0.3).toFixed(2)}rem`,
      '--debris-duration': `${10 + ((index * 5) % 7)}s`,
      '--debris-delay': `${(-index * 1.9).toFixed(1)}s`,
      '--debris-spin': `${index % 2 ? 220 : -220}deg`,
      '--wobble-duration': `${(2.4 + (index % 4) * 0.6).toFixed(1)}s`,
    },
  })),
);
</script>

<template>
  <div
    class="error-singularity relative mx-auto aspect-square w-full max-w-80
      sm:max-w-100"
    aria-hidden="true"
  >
    <div
      class="singularity-orbit absolute inset-1/12 rounded-full border
        border-dashed border-border-2"
    ></div>
    <div
      class="singularity-orbit singularity-orbit-inner absolute inset-1/5
        rounded-full border border-dashed border-border-2"
    ></div>
    <div class="singularity-disk absolute inset-1/6 rounded-full"></div>

    <span
      v-for="piece in pieces"
      :key="piece.name"
      class="singularity-debris absolute top-1/2 left-1/2 leading-none"
      :style="piece.style"
    >
      <Icon :name="piece.name" class="singularity-wobble block text-text-2" />
    </span>

    <div
      class="singularity-core absolute inset-1/3 flex items-center
        justify-center rounded-full text-accent"
    >
      <Icon
        :name="icon ?? ERROR_FALLBACK_ICON"
        class="singularity-icon size-1/2"
      />
    </div>
  </div>
</template>

<style scoped>
/* Debris orbits are measured in container units of the square scene. */
.error-singularity {
  container-type: size;
}

.singularity-orbit {
  opacity: 0.45;
  animation: singularity-spin 60s linear infinite;
}
.singularity-orbit-inner {
  animation-duration: 40s;
  animation-direction: reverse;
}

.singularity-disk {
  background: conic-gradient(
    from 0deg,
    transparent,
    color-mix(in oklab, var(--color-accent) 60%, transparent) 12%,
    transparent 30%,
    color-mix(in oklab, var(--color-accent) 35%, transparent) 55%,
    transparent 75%,
    color-mix(in oklab, var(--color-accent) 20%, transparent) 90%,
    transparent
  );
  mask-image: radial-gradient(
    closest-side,
    transparent 45%,
    black 62%,
    transparent 100%
  );
  filter: blur(0.5rem);
  animation: singularity-spin 12s linear infinite;
}

.singularity-core {
  border: 1px solid color-mix(in oklab, var(--color-accent) 45%, transparent);
  background: radial-gradient(
    closest-side,
    var(--color-bg-1) 55%,
    color-mix(in oklab, var(--color-accent) 18%, var(--color-bg-1))
  );
  box-shadow:
    0 0 0 0.4rem color-mix(in oklab, var(--color-accent) 10%, transparent),
    0 0 3rem color-mix(in oklab, var(--color-accent) 35%, transparent),
    inset 0 0 1.5rem color-mix(in oklab, var(--color-accent) 25%, transparent);
}

.singularity-icon {
  filter: drop-shadow(
    0 0 0.6rem color-mix(in oklab, var(--color-accent) 60%, transparent)
  );
  animation: singularity-breathe 6s ease-in-out infinite;
}

.singularity-debris {
  font-size: var(--debris-size);
  opacity: 0;
  animation: singularity-infall var(--debris-duration)
    cubic-bezier(0.45, 0, 0.85, 0.55) var(--debris-delay) infinite;
}

.singularity-wobble {
  animation: singularity-wobble var(--wobble-duration) ease-in-out infinite
    alternate;
}

@keyframes singularity-spin {
  to {
    rotate: 360deg;
  }
}

@keyframes singularity-breathe {
  50% {
    scale: 1.07;
  }
}

@keyframes singularity-wobble {
  from {
    translate: -0.12em 0.08em;
    rotate: -9deg;
  }
  to {
    translate: 0.12em -0.1em;
    rotate: 9deg;
  }
}

/* A spiral: the angle keeps turning while the distance collapses. */
@keyframes singularity-infall {
  0% {
    transform: translate(-50%, -50%) rotate(var(--debris-angle))
      translateX(calc(var(--debris-distance) * 50cqmin))
      rotate(calc(-1 * var(--debris-angle))) scale(1);
    opacity: 0;
  }
  15% {
    opacity: 0.85;
  }
  70% {
    opacity: 0.75;
  }
  100% {
    transform: translate(-50%, -50%) rotate(calc(var(--debris-angle) + 260deg))
      translateX(8cqmin)
      rotate(calc(-1 * var(--debris-angle) + var(--debris-spin))) scale(0.1);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .singularity-orbit,
  .singularity-disk,
  .singularity-icon,
  .singularity-wobble {
    animation: none;
  }
  .singularity-debris {
    animation: none;
    opacity: 0.5;
    transform: translate(-50%, -50%) rotate(var(--debris-angle))
      translateX(calc(var(--debris-distance) * 50cqmin))
      rotate(calc(-1 * var(--debris-angle)));
  }
}
</style>
