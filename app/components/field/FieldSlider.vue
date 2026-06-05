<script setup lang="ts">
import { useFloating, offset, shift } from '@floating-ui/vue';
import { debounce } from 'perfect-debounce';

const props = defineProps<{
  values: number[];
  format?: (value: number) => string;
}>();

const model = defineModel<number>();

function nearestIndex(value: number) {
  let bestIndex = 0;
  let bestDistance = Infinity;

  props.values.forEach((v, i) => {
    const distance = Math.abs(v - value);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  });

  return bestIndex;
}

const index = computed({
  get() {
    return model.value !== undefined ? nearestIndex(model.value) : 0;
  },
  set(i: number) {
    model.value = props.values[i]!;
  },
});

const progress = computed(() => {
  if (props.values.length <= 1) return 0;
  return (index.value / (props.values.length - 1)) * 100;
});

function label(value: number) {
  return props.format ? props.format(value) : String(value);
}

const containerElement = useTemplateRef<HTMLElement>('container');
const anchorElement = useTemplateRef<HTMLElement>('anchor');
const labelElement = useTemplateRef<HTMLElement>('labelElement');

const { floatingStyles, update } = useFloating(anchorElement, labelElement, {
  placement: 'top',
  middleware: computed(() => [
    offset(4),
    shift({
      boundary: containerElement.value ?? 'clippingAncestors',
      padding: 0,
    }),
  ]),
});

watch(index, () => nextTick(update));

const debouncedUpdate = debounce(() => nextTick(update), 50);

onMounted(() => window.addEventListener('resize', debouncedUpdate));
onUnmounted(() => window.removeEventListener('resize', debouncedUpdate));
</script>

<template>
  <div class="flex w-full items-end gap-3">
    <slot name="before"></slot>

    <div ref="container" class="relative flex-1 pt-7">
      <!-- Zero-size anchor at thumb x-position, top of track -->
      <span
        ref="anchor"
        class="pointer-events-none absolute top-7 h-0 w-0"
        :style="{
          left: `calc(${progress}% + ${(0.5 - progress / 100) * 1.375}rem)`,
        }"
      />

      <!-- Label positioned by floating-ui, shifted to stay within container -->
      <span
        ref="labelElement"
        class="absolute rounded-normal bg-bg-3 px-2 py-0.5 text-xs font-semibold
          whitespace-nowrap text-text-1"
        :style="floatingStyles"
      >
        {{ label(values[index]!) }}
      </span>

      <input
        type="range"
        :min="0"
        :max="values.length - 1"
        step="1"
        :value="index"
        class="slider w-full cursor-pointer appearance-none rounded-full
          focus-visible:outline-2 focus-visible:outline-offset-4
          focus-visible:outline-accent"
        :style="{
          '--progress': `${progress}%`,
        }"
        @input="index = ($event.target as HTMLInputElement).valueAsNumber"
      />
    </div>

    <slot name="after"></slot>
  </div>
</template>

<style scoped>
.slider {
  height: 0.5rem;
  background: linear-gradient(
    to right,
    var(--color-accent) var(--progress),
    var(--color-border-1) var(--progress)
  );
}

.slider::-webkit-slider-thumb {
  appearance: none;
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 9999px;
  background: white;
  border: 4px solid var(--color-accent);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
}

.slider::-moz-range-thumb {
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 9999px;
  background: white;
  border: 3px solid var(--color-accent);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
}
</style>
