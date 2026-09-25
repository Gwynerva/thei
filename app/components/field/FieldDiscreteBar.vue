<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import {
  nearestStopIndex,
  steppedIndex,
  trackInset,
  trackPosition,
  type DiscreteBarStop,
  type DiscreteBarTone,
} from './discrete-bar-stops';

/**
 * A choice among a few named stops on one track.
 *
 * The knob is dragged, a stop is tapped, or the arrows walk the stops; the
 * chosen one is named in the header. Each stop may carry a caption under it —
 * the size it comes out at, say — so the whole set is compared at a glance
 * rather than found by sliding about. A caption that is only a guess is
 * muted until the real one replaces it.
 */
const props = defineProps<{
  stops: DiscreteBarStop[];
  /** Names the control for assistive technology. */
  label: string;
  /** Shown at the start of the header, as the field's own caption. */
  title?: string;
  /** Shown after the chosen stop's name: its full caption, with a unit. */
  detail?: string;
  /** Shown before the chosen stop's name, in its tone. */
  icon?: IconName;
  /** A `fieldset` does not disable this, so the owner says so itself. */
  disabled?: boolean;
}>();

const model = defineModel<string>({ required: true });

const count = computed(() => props.stops.length);
const index = computed(() =>
  Math.max(
    0,
    props.stops.findIndex((stop) => stop.value === model.value),
  ),
);
const current = computed(() => props.stops[index.value]);
const tone = computed<DiscreteBarTone>(() => current.value?.tone ?? 'neutral');
const hasCaptions = computed(() =>
  props.stops.some((stop) => stop.caption || stop.pending),
);

const FILL: Record<DiscreteBarTone, string> = {
  neutral: 'bg-accent',
  warning: 'bg-text-warning',
  alert: 'bg-text-error',
};
const RING: Record<DiscreteBarTone, string> = {
  neutral: 'border-accent',
  warning: 'border-text-warning',
  alert: 'border-text-error',
};
const HEADING: Record<DiscreteBarTone, string> = {
  neutral: 'text-text-1',
  warning: 'text-text-warning',
  alert: 'text-text-error',
};

function select(next: number) {
  if (props.disabled) return;
  const stop = props.stops[next];
  if (stop && stop.value !== model.value) model.value = stop.value;
}

const row = useTemplateRef<HTMLElement>('row');
let pointerId: number | undefined;

function pick(event: PointerEvent) {
  const box = row.value?.getBoundingClientRect();
  if (!box?.width) return;
  select(nearestStopIndex(event.clientX - box.left, box.width, count.value));
}

function startDrag(event: PointerEvent) {
  if (props.disabled || event.button > 0) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  pointerId = event.pointerId;
  row.value?.focus({ preventScroll: true });
  pick(event);
}

function moveDrag(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  pick(event);
}

function endDrag(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }
  pointerId = undefined;
}

function onKey(event: KeyboardEvent) {
  if (props.disabled) return;
  const next = steppedIndex(index.value, event.key, count.value);
  if (next === undefined) return;
  event.preventDefault();
  select(next);
}

function captionClass(stop: DiscreteBarStop, at: number) {
  if (at === index.value) return 'font-semibold text-text-1';
  return stop.approximate ? 'text-text-3' : 'text-text-2';
}
</script>

<template>
  <div
    class="flex w-full min-w-0 flex-col"
    :class="disabled ? 'opacity-50' : ''"
  >
    <div class="flex items-center gap-xs text-sm">
      <span v-if="title" class="grow text-text-2">{{ title }}</span>
      <span
        class="ml-auto flex min-w-0 items-center gap-1 font-semibold"
        :class="HEADING[tone]"
      >
        <Icon v-if="icon" :name="icon" class="shrink-0" />
        <span class="truncate">{{ current?.label }}</span>
        <span
          v-if="detail"
          class="font-normal whitespace-nowrap text-text-3 tabular-nums"
        >
          · {{ detail }}
        </span>
      </span>
    </div>

    <div
      ref="row"
      role="slider"
      :tabindex="disabled ? -1 : 0"
      :aria-label="label"
      aria-orientation="horizontal"
      :aria-valuemin="0"
      :aria-valuemax="Math.max(0, count - 1)"
      :aria-valuenow="index"
      :aria-valuetext="current?.label"
      :aria-disabled="disabled || undefined"
      class="relative touch-none rounded-normal py-3 outline-none select-none
        focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:py-4"
      :class="disabled ? 'cursor-default' : 'cursor-pointer'"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @keydown="onKey"
    >
      <div
        class="relative h-2"
        :style="{ marginInline: `${trackInset(count)}%` }"
      >
        <div class="absolute inset-0 rounded-full bg-border-1"></div>
        <div
          class="absolute inset-y-0 left-0 rounded-full transition-[width]
            motion-reduce:transition-none"
          :class="FILL[tone]"
          :style="{ width: `${trackPosition(index, count)}%` }"
        ></div>
        <span
          v-for="(stop, at) in stops"
          :key="stop.value"
          class="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2
            rounded-full"
          :class="at <= index ? 'bg-bg-1/70' : 'bg-bg-1'"
          :style="{ left: `${trackPosition(at, count)}%` }"
          aria-hidden="true"
        ></span>
        <span
          class="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2
            rounded-full border-4 bg-white shadow-md shadow-shadow-3
            transition-[left] motion-reduce:transition-none
            pointer-coarse:size-6"
          :class="RING[tone]"
          :style="{ left: `${trackPosition(index, count)}%` }"
          aria-hidden="true"
        ></span>
      </div>
    </div>

    <div
      v-if="hasCaptions"
      class="grid text-center text-xs leading-tight tabular-nums"
      :style="{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }"
    >
      <button
        v-for="(stop, at) in stops"
        :key="stop.value"
        type="button"
        tabindex="-1"
        aria-hidden="true"
        class="flex h-4 min-w-0 cursor-pointer items-center justify-center
          whitespace-nowrap disabled:cursor-default"
        :class="captionClass(stop, at)"
        :disabled="disabled"
        :data-title-popup="stop.title"
        @click="select(at)"
      >
        <Icon
          v-if="stop.pending && !stop.caption"
          name="loading"
          class="text-text-3"
        />
        <template v-else-if="stop.caption">{{ stop.caption }}</template>
      </button>
    </div>
  </div>
</template>
