<script lang="ts" setup>
const props = defineProps<{
  isPaused: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  volume: number;
  hasAudio: boolean;
}>();

const emit = defineEmits<{
  togglePlay: [];
  seek: [value: number];
  toggleMute: [];
  volume: [value: number];
}>();

const seekPct = computed(() =>
  props.duration > 0 ? `${(props.currentTime / props.duration) * 100}%` : '0%',
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

function emitSeek(e: Event): void {
  const value = parseFloat((e.target as HTMLInputElement).value);
  if (Number.isFinite(value)) emit('seek', value);
}

function emitVolume(e: Event): void {
  const value = parseFloat((e.target as HTMLInputElement).value);
  if (Number.isFinite(value)) emit('volume', value);
}
</script>

<template>
  <div
    class="absolute right-md bottom-md left-md z-10 flex min-w-80 cursor-default
      items-center rounded-full border-2 border-border-3/30 bg-bg-2/60 px-xs
      shadow-[0_0_10px_2px_var(--color-shadow-3)] backdrop-blur transition
      sm:right-0 sm:left-1/2 sm:w-5/8 sm:-translate-x-1/2
      hocus:border-border-3/50 hocus:bg-bg-2/80"
    @pointerdown.stop
    @pointermove.stop
    @pointerup.stop
    @pointercancel.stop
  >
    <button
      class="flex cursor-pointer items-center justify-center rounded-full p-xs
        text-text-1/70 transition hocus:text-text-1"
      @click="emit('togglePlay')"
    >
      <Icon :name="isPaused ? 'play-circle' : 'pause-circle'" />
    </button>

    <span class="shrink-0 text-xs text-text-1/70 tabular-nums select-none">
      {{ formatTime(currentTime) }}
    </span>

    <input
      type="range"
      class="seek-bar mx-sm"
      min="0"
      :max="duration || 0"
      :value="currentTime"
      step="0.01"
      :style="{ '--pct': seekPct }"
      @input="emitSeek"
    />

    <span class="shrink-0 text-xs text-text-1/70 tabular-nums select-none">
      {{ formatTime(duration) }}
    </span>

    <button
      v-if="hasAudio"
      class="flex shrink-0 cursor-pointer items-center justify-center
        rounded-full p-xs text-text-1/70 transition hocus:text-text-1"
      @click="emit('toggleMute')"
    >
      <Icon :name="isMuted || volume === 0 ? 'volume-off' : 'volume-on'" />
    </button>

    <input
      v-if="hasAudio"
      type="range"
      class="volume-bar mr-xs"
      min="0"
      max="1"
      :value="isMuted ? 0 : volume"
      step="0.01"
      :style="{ '--pct': volumePct }"
      @input="emitVolume"
    />
  </div>
</template>

<style scoped>
.seek-bar,
.volume-bar {
  appearance: none;
  -webkit-appearance: none;
  height: 4px;
  border-radius: 2px;
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
  width: 2.5rem;
  flex-shrink: 0;
}

.seek-bar::-webkit-slider-thumb,
.volume-bar::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
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
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  background: var(--color-text-1);
  cursor: pointer;
}

.seek-bar::-moz-range-track,
.volume-bar::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: transparent;
}
</style>
