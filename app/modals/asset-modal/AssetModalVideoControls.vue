<script lang="ts" setup>
const props = defineProps<{
  isPaused: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  volume: number;
  /** `undefined` while unknown: the volume controls stay available. */
  hasAudio?: boolean;
}>();

const emit = defineEmits<{
  togglePlay: [];
  seek: [value: number];
  toggleMute: [];
  volume: [value: number];
}>();

// While the thumb is dragged the bar follows the pointer, not playback.
const scrubTime = ref<number | null>(null);
const shownTime = computed(() => scrubTime.value ?? props.currentTime);

const seekPct = computed(() =>
  props.duration > 0
    ? `${Math.min(100, (shownTime.value / props.duration) * 100)}%`
    : '0%',
);

const volumePct = computed(() =>
  props.isMuted ? '0%' : `${props.volume * 100}%`,
);

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function rangeValue(e: Event): number | undefined {
  const value = parseFloat((e.target as HTMLInputElement).value);
  return Number.isFinite(value) ? value : undefined;
}

function onSeekInput(e: Event): void {
  const value = rangeValue(e);
  if (value === undefined) return;
  scrubTime.value = value;
  emit('seek', value);
}

function onSeekChange(e: Event): void {
  const value = rangeValue(e);
  scrubTime.value = null;
  if (value !== undefined) emit('seek', value);
}

function emitVolume(e: Event): void {
  const value = rangeValue(e);
  if (value !== undefined) emit('volume', value);
}
</script>

<template>
  <div
    class="absolute right-md bottom-md left-md z-10 flex min-w-80 cursor-default
      items-center gap-1 rounded-full border-2 border-border-3/30 bg-bg-2/60
      px-xs shadow-lg shadow-shadow-3 backdrop-blur transition sm:right-0
      sm:left-1/2 sm:w-5/8 sm:-translate-x-1/2 hocus:border-border-3/50
      hocus:bg-bg-2/80"
    @pointerdown.stop
    @pointermove.stop
    @pointerup.stop
    @pointercancel.stop
  >
    <button
      type="button"
      class="flex shrink-0 cursor-pointer items-center justify-center
        rounded-full p-xs text-text-1/70 transition hocus:text-text-1"
      :aria-label="isPaused ? phrase.video_play : phrase.video_pause"
      @click="emit('togglePlay')"
    >
      <Icon :name="isPaused ? 'play-circle' : 'pause-circle'" />
    </button>

    <span class="shrink-0 text-xs text-text-1/70 tabular-nums select-none">
      {{ formatTime(shownTime) }}
    </span>

    <input
      type="range"
      class="seek-bar mx-sm"
      min="0"
      :max="duration || 0"
      :value="shownTime"
      step="0.01"
      :aria-label="phrase.video_seek"
      :style="{ '--pct': seekPct }"
      @input="onSeekInput"
      @change="onSeekChange"
      @blur="scrubTime = null"
    />

    <span class="shrink-0 text-xs text-text-1/70 tabular-nums select-none">
      {{ formatTime(duration) }}
    </span>

    <div class="flex shrink-0 items-center">
      <template v-if="hasAudio !== false">
        <button
          type="button"
          class="flex shrink-0 cursor-pointer items-center justify-center
            rounded-full p-xs text-text-1/70 transition hocus:text-text-1"
          :aria-label="isMuted ? phrase.video_unmute : phrase.video_mute"
          @click="emit('toggleMute')"
        >
          <Icon :name="isMuted || volume === 0 ? 'volume-off' : 'volume-on'" />
        </button>

        <input
          type="range"
          class="volume-bar mr-xs"
          min="0"
          max="1"
          :value="isMuted ? 0 : volume"
          step="0.01"
          :aria-label="phrase.video_volume"
          :style="{ '--pct': volumePct }"
          @input="emitVolume"
        />
      </template>
      <span
        v-else
        class="flex cursor-help items-center gap-1 rounded-full p-xs text-xs
          text-text-1/45 select-none"
        :data-title-popup="phrase.video_no_audio"
      >
        <Icon name="volume-off" class="text-base" />
        <span class="pr-1">{{ phrase.video_no_audio_short }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.seek-bar,
.volume-bar {
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

.seek-bar {
  flex: 1;
  min-width: 0;
}

.volume-bar {
  width: calc(var(--spacing) * 10);
  flex-shrink: 0;
}

.seek-bar::-webkit-slider-thumb,
.volume-bar::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: calc(var(--spacing) * 3);
  height: calc(var(--spacing) * 3);
  border-radius: 50%;
  background: var(--color-text-1);
  cursor: pointer;
  transition: transform 0.15s;
}

.seek-bar::-webkit-slider-thumb:hover,
.volume-bar::-webkit-slider-thumb:hover {
  transform: scale(1.3);
}

.seek-bar::-moz-range-thumb,
.volume-bar::-moz-range-thumb {
  width: calc(var(--spacing) * 3);
  height: calc(var(--spacing) * 3);
  border-radius: 50%;
  border: none;
  background: var(--color-text-1);
  cursor: pointer;
}

.seek-bar::-moz-range-track,
.volume-bar::-moz-range-track {
  height: var(--spacing);
  border-radius: var(--radius-sm);
  background: transparent;
}
</style>
