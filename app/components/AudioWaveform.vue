<script lang="ts" setup>
import { formatMediaTime, poolAudioPeaks } from '#layers/thei/shared/audio';

const props = defineProps<{
  /** Stored loudness, 0 to 100; empty draws a flat track. */
  peaks: number[];
  /** Seconds played. */
  current: number;
  duration: number;
}>();

const emit = defineEmits<{
  seek: [seconds: number];
  /**
   * Where the pointer drags to, before it lets go; `null` once it has, after
   * the `seek` to where it let go, or without one when the drag was cancelled.
   */
  scrub: [seconds: number | null];
  toggle: [];
}>();

/** About one bar per 4 px; the server draws a typical width. */
const BAR_SPACING_PX = 4;
const MIN_BARS = 24;
const SERVER_BARS = 64;
/** The height a silent stretch keeps, so the track still reads as one. */
const FLOOR = 8;
const KEY_STEP = 5;

const root = useTemplateRef<HTMLElement>('root');
const barCount = ref(SERVER_BARS);
const scrubbing = ref<number | null>(null);

const bars = computed(() => {
  const pooled = poolAudioPeaks(props.peaks, barCount.value);
  return pooled.length
    ? pooled.map((peak) => Math.max(FLOOR, peak))
    : Array.from({ length: barCount.value }, () => FLOOR);
});
const shown = computed(() => scrubbing.value ?? props.current);
const played = computed(() =>
  props.duration > 0
    ? `${Math.min(100, Math.max(0, (shown.value / props.duration) * 100))}%`
    : '0%',
);

let observer: ResizeObserver | undefined;
onMounted(() => {
  if (!root.value) return;
  observer = new ResizeObserver(([entry]) => {
    const width = entry?.contentRect.width ?? 0;
    if (!width) return;
    barCount.value = Math.min(
      Math.max(props.peaks.length, MIN_BARS),
      Math.max(MIN_BARS, Math.round(width / BAR_SPACING_PX)),
    );
  });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

function timeAt(clientX: number): number {
  const rect = root.value?.getBoundingClientRect();
  if (!rect || !rect.width || !(props.duration > 0)) return 0;
  const share = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return share * props.duration;
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  // No text or block selection starts from here, in a page or the editor.
  event.preventDefault();
  root.value?.focus({ preventScroll: true });
  root.value?.setPointerCapture(event.pointerId);
  scrubbing.value = timeAt(event.clientX);
  emit('scrub', scrubbing.value);
}

function onPointerMove(event: PointerEvent) {
  if (scrubbing.value === null) return;
  scrubbing.value = timeAt(event.clientX);
  emit('scrub', scrubbing.value);
}

function onPointerUp(event: PointerEvent) {
  if (scrubbing.value === null) return;
  const time = timeAt(event.clientX);
  scrubbing.value = null;
  // The new place first, so whatever goes on after the drag goes on there.
  emit('seek', time);
  emit('scrub', null);
}

function onPointerCancel() {
  if (scrubbing.value === null) return;
  scrubbing.value = null;
  emit('scrub', null);
}

/**
 * The keys of a slider, and Space to play. Each is the player's alone:
 * inside the text editor an arrow would otherwise move the caret on to the
 * next block, and focus with it.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const end = props.duration;
  const page = end > 0 ? end / 10 : KEY_STEP * 2;
  let target: number | undefined;
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      target = props.current - KEY_STEP;
      break;
    case 'ArrowRight':
    case 'ArrowUp':
      target = props.current + KEY_STEP;
      break;
    case 'PageDown':
      target = props.current - page;
      break;
    case 'PageUp':
      target = props.current + page;
      break;
    case 'Home':
      target = 0;
      break;
    case 'End':
      target = end;
      break;
    case ' ':
      event.preventDefault();
      event.stopPropagation();
      emit('toggle');
      return;
    default:
      return;
  }
  event.preventDefault();
  event.stopPropagation();
  emit('seek', target);
}
</script>

<template>
  <div
    ref="root"
    role="slider"
    tabindex="0"
    data-drag-ignore
    data-audio-waveform
    class="relative flex h-full cursor-pointer touch-pan-y items-center
      rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
    :aria-label="phrase.video_seek"
    aria-valuemin="0"
    :aria-valuemax="Math.round(duration)"
    :aria-valuenow="Math.round(Math.min(shown, duration || shown))"
    :aria-valuetext="
      phrase.audio_position(formatMediaTime(shown), formatMediaTime(duration))
    "
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @lostpointercapture="onPointerCancel"
    @keydown="onKeydown"
  >
    <span class="flex size-full items-center gap-px text-text-3/50">
      <span
        v-for="(bar, index) in bars"
        :key="index"
        class="min-w-px flex-1 rounded-full bg-current"
        :style="{ height: `${bar}%` }"
      />
    </span>
    <span
      class="absolute inset-0 flex items-center gap-px text-accent"
      :style="{ clipPath: `inset(0 calc(100% - ${played}) 0 0)` }"
      aria-hidden="true"
    >
      <span
        v-for="(bar, index) in bars"
        :key="index"
        class="min-w-px flex-1 rounded-full bg-current"
        :style="{ height: `${bar}%` }"
      />
    </span>
  </div>
</template>
