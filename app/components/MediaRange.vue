<script lang="ts" setup>
/**
 * A media player's slider: a position or a volume, drawn the same in every
 * browser, the part already played filled in.
 */
const props = withDefaults(
  defineProps<{
    value: number;
    max: number;
    min?: number;
    step?: number;
    label: string;
    /** `seek` takes the room left; `volume` is short and fixed. */
    variant?: 'seek' | 'volume';
  }>(),
  { min: 0, step: 0.01, variant: 'seek' },
);

const emit = defineEmits<{
  input: [value: number];
  change: [value: number];
}>();

const pct = computed(() => {
  const span = props.max - props.min;
  if (!(span > 0)) return '0%';
  const share = (props.value - props.min) / span;
  return `${Math.min(100, Math.max(0, share * 100))}%`;
});

function valueOf(event: Event): number | undefined {
  const value = parseFloat((event.target as HTMLInputElement).value);
  return Number.isFinite(value) ? value : undefined;
}

function onInput(event: Event) {
  const value = valueOf(event);
  if (value !== undefined) emit('input', value);
}

function onChange(event: Event) {
  const value = valueOf(event);
  if (value !== undefined) emit('change', value);
}

const SLIDER_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/**
 * The keys the slider moves with are its own. Inside the text editor they
 * would also move the caret to the next block, and focus with it.
 */
function onKeydown(event: KeyboardEvent) {
  if (SLIDER_KEYS.has(event.key)) event.stopPropagation();
}
</script>

<template>
  <input
    type="range"
    class="media-range"
    :class="variant === 'volume' ? 'media-range-volume' : 'media-range-seek'"
    :min
    :max
    :step
    :value
    :aria-label="label"
    :style="{ '--pct': pct }"
    @input="onInput"
    @change="onChange"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.media-range {
  /* Native media ranges require browser-specific track and thumb selectors. */
  appearance: none;
  -webkit-appearance: none;
  height: var(--spacing);
  border-radius: var(--radius-sm);
  cursor: pointer;
  outline: none;
  background: linear-gradient(
    to right,
    color-mix(in oklch, var(--color-text-1) 70%, transparent) 0%,
    color-mix(in oklch, var(--color-text-1) 70%, transparent) var(--pct, 0%),
    color-mix(in oklch, var(--color-text-1) 20%, transparent) var(--pct, 0%),
    color-mix(in oklch, var(--color-text-1) 20%, transparent) 100%
  );
}

.media-range-seek {
  flex: 1;
  min-width: 0;
}

.media-range-volume {
  width: calc(var(--spacing) * 10);
  flex-shrink: 0;
}

.media-range::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: calc(var(--spacing) * 3);
  height: calc(var(--spacing) * 3);
  border-radius: 50%;
  background: var(--color-text-1);
  cursor: pointer;
  transition: transform 0.15s;
}

@media (hover: hover) {
  .media-range::-webkit-slider-thumb:hover {
    transform: scale(1.3);
  }
}

.media-range:focus-visible::-webkit-slider-thumb {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.media-range::-moz-range-thumb {
  width: calc(var(--spacing) * 3);
  height: calc(var(--spacing) * 3);
  border-radius: 50%;
  border: none;
  background: var(--color-text-1);
  cursor: pointer;
}

.media-range:focus-visible::-moz-range-thumb {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.media-range::-moz-range-track {
  height: var(--spacing);
  border-radius: var(--radius-sm);
  background: transparent;
}
</style>
