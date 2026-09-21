<script lang="ts" setup>
import {
  DATE_PRECISIONS,
  datePrecisionAtStep,
  datePrecisionStep,
  datePrecisionTone,
  type DatePrecision,
} from '#layers/thei/shared/date-precision';

/**
 * How sure the owner is of a date, on a four-stop track.
 *
 * It sits next to the calendar rather than inside it: the date picker is a
 * third-party widget whose own layout breaks the moment anything is grafted
 * into it, and certainty is a separate question anyway.
 */
const model = defineModel<DatePrecision>({ required: true });

const step = computed({
  get: () => datePrecisionStep(model.value),
  set: (value: number) => {
    model.value = datePrecisionAtStep(value);
  },
});

const last = DATE_PRECISIONS.length - 1;
const progress = computed(() => (step.value / last) * 100);
const tone = computed(() => datePrecisionTone(model.value));

const toneColor = computed(() => {
  switch (tone.value) {
    case 'neutral':
      return 'var(--color-accent)';
    case 'warning':
      return 'var(--color-text-warning)';
    case 'alert':
      return 'var(--color-text-error)';
  }
});

const labels = computed<Record<DatePrecision, string>>(() => ({
  exact: phrase.value.date_precision_exact,
  day: phrase.value.date_precision_day,
  month: phrase.value.date_precision_month,
  year: phrase.value.date_precision_year,
}));
</script>

<template>
  <div class="flex w-full flex-col gap-xs">
    <div class="relative pt-1">
      <input
        type="range"
        :min="0"
        :max="last"
        step="1"
        :value="step"
        :aria-label="phrase.date_precision"
        :aria-valuetext="labels[model]"
        class="precision w-full cursor-pointer appearance-none rounded-full
          focus-visible:outline-2 focus-visible:outline-offset-4
          focus-visible:outline-accent"
        :style="{ '--progress': `${progress}%`, '--tone': toneColor }"
        @input="step = ($event.target as HTMLInputElement).valueAsNumber"
      />
      <div class="pointer-events-none absolute inset-x-0 top-1 flex h-2">
        <span
          v-for="(precision, index) in DATE_PRECISIONS"
          :key="precision"
          class="flex-1"
          :class="index === last ? 'hidden' : ''"
        >
          <span
            class="ml-auto block h-2 w-px bg-bg-1/80"
            aria-hidden="true"
          ></span>
        </span>
      </div>
    </div>
    <div class="flex items-center gap-xs text-sm">
      <Icon
        v-if="model !== 'exact'"
        name="approximate"
        class="shrink-0"
        :style="{ color: toneColor }"
      />
      <span :style="model === 'exact' ? undefined : { color: toneColor }">
        {{ labels[model] }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Native range tracks and thumbs require browser-specific pseudo-elements. */
.precision {
  height: calc(var(--spacing) * 2);
  background: linear-gradient(
    to right,
    var(--tone) var(--progress),
    var(--color-border-1) var(--progress)
  );
}

.precision::-webkit-slider-thumb {
  appearance: none;
  width: var(--spacing-md);
  height: var(--spacing-md);
  border: var(--spacing) solid var(--tone);
  border-radius: 9999px;
  background: var(--color-white);
  box-shadow: var(--shadow-md);
}

.precision::-moz-range-thumb {
  width: var(--spacing-md);
  height: var(--spacing-md);
  border: 3px solid var(--tone);
  border-radius: 9999px;
  background: var(--color-white);
  box-shadow: var(--shadow-md);
}
</style>
