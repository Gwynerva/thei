<script lang="ts" setup>
import { formatMediaTime } from '#layers/thei/shared/audio';

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

function onSeekInput(value: number): void {
  scrubTime.value = value;
  emit('seek', value);
}

function onSeekChange(value: number): void {
  scrubTime.value = null;
  emit('seek', value);
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
      {{ formatMediaTime(shownTime) }}
    </span>

    <MediaRange
      class="mx-sm"
      :max="duration || 0"
      :value="shownTime"
      :label="phrase.video_seek"
      @input="onSeekInput"
      @change="onSeekChange"
      @blur="scrubTime = null"
    />

    <span
      class="shrink-0 text-xs text-text-1/70 tabular-nums select-none"
      :class="hasAudio === false ? 'pr-xs' : ''"
    >
      {{ formatMediaTime(duration) }}
    </span>

    <!--
      A video with no sound says nothing about sound: no button, no slider, not
      even a note that there is none. What is left is the bar, which keeps its
      own margin from the edge instead of running into it.
    -->
    <div v-if="hasAudio !== false" class="flex shrink-0 items-center">
      <MediaVolumeControl
        :volume
        :muted="isMuted"
        button-class="justify-center rounded-full p-xs text-text-1/70
          transition hocus:text-text-1"
        range-class="mr-xs"
        @toggle="emit('toggleMute')"
        @volume="emit('volume', $event)"
      />
    </div>
  </div>
</template>
