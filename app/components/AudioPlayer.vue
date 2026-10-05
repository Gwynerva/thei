<script lang="ts" setup>
import { formatMediaTime } from '#layers/thei/shared/audio';
import { useAudioPlayback } from '#layers/thei/app/composables/audio-playback';

/**
 * A recording, played in place. The browser's own `<audio>` plays it; the
 * controls are the site's, so they look the same everywhere and follow its
 * colours. Nothing of the file loads until it is played: the length and the
 * waveform come from what the server read when it was stored.
 */
const props = withDefaults(
  defineProps<{
    /** Site path of the file, without the base path. */
    src: string;
    extension?: string;
    /** Seconds, as stored; 0 leaves it to the file. */
    duration?: number;
    peaks?: number[];
    /** What the system's media controls call it; already formatted. */
    title?: string;
    /** Offer the file for download beside the controls. */
    download?: boolean;
  }>(),
  {
    extension: undefined,
    duration: 0,
    peaks: () => [],
    title: undefined,
    download: false,
  },
);

const audio = useTemplateRef<HTMLAudioElement>('audio');
const playback = useAudioPlayback(audio, {
  extension: () => props.extension,
  duration: () => props.duration,
  title: () => props.title,
});
const { paused, current, duration, rate, volume, muted, unsupported, waiting } =
  playback;

/** While the waveform is dragged, the time follows the pointer. */
const scrub = ref<number | null>(null);
const shownTime = computed(() => scrub.value ?? current.value);
/** Playing when the drag began: it goes on, from the new place, once let go. */
let resumeAfterScrub = false;

/**
 * Dragging along the waveform holds the sound: it would otherwise go on
 * playing from where it was while the pointer shows somewhere else.
 */
function onScrub(time: number | null) {
  if (time !== null && scrub.value === null) {
    resumeAfterScrub = !paused.value;
    if (resumeAfterScrub) playback.pause();
  }
  scrub.value = time;
  if (time === null && resumeAfterScrub) {
    resumeAfterScrub = false;
    void playback.play();
  }
}
const rateLabel = computed(() => `${rate.value}×`);
/**
 * A page's address already ends in the file's name; the library's does not,
 * and a download from there would be saved as "content".
 */
const downloadName = computed(() =>
  /\.[a-z0-9]+$/i.test(props.src) || !props.extension
    ? ''
    : `audio.${props.extension}`,
);
</script>

<template>
  <!-- The waveform has the whole width; every control sits on the line
       under it, play first. -->
  <div class="flex min-w-0 flex-col gap-1" data-audio-player>
    <audio ref="audio" :src="sitePath(src)" preload="none" class="hidden" />

    <p
      v-if="unsupported"
      class="py-xs text-sm text-text-2"
      data-audio-unsupported
    >
      {{ phrase.audio_unsupported }}
    </p>
    <div v-else class="h-10">
      <AudioWaveform
        :peaks
        :current="shownTime"
        :duration
        @seek="playback.seek($event)"
        @scrub="onScrub"
        @toggle="playback.toggle()"
      />
    </div>

    <div class="flex min-w-0 items-center gap-xs text-xs text-text-2">
      <template v-if="!unsupported">
        <button
          type="button"
          data-drag-ignore
          data-audio-play
          class="-ml-1 flex size-8 shrink-0 cursor-pointer items-center
            justify-center rounded-full text-2xl text-accent transition
            outline-none focus-visible:ring-2 focus-visible:ring-accent
            hocus:text-text-1"
          :aria-label="paused ? phrase.video_play : phrase.video_pause"
          @click="playback.toggle()"
        >
          <Icon
            :name="
              !paused && waiting
                ? 'loading'
                : paused
                  ? 'play-circle'
                  : 'pause-circle'
            "
          />
        </button>
        <span class="tabular-nums select-none" data-audio-time>
          {{ formatMediaTime(shownTime) }} / {{ formatMediaTime(duration) }}
        </span>
      </template>
      <span class="flex-1" />
      <template v-if="!unsupported">
        <button
          type="button"
          data-drag-ignore
          data-audio-speed
          class="cursor-pointer rounded-sm px-1.5 py-0.5 font-semibold
            tabular-nums transition outline-none focus-visible:ring-2
            focus-visible:ring-accent hocus:bg-bg-3 hocus:text-text-1"
          :aria-label="phrase.audio_speed(rateLabel)"
          :data-title-popup="phrase.audio_speed(rateLabel)"
          @click="playback.cycleRate()"
        >
          {{ rateLabel }}
        </button>
        <button
          type="button"
          data-drag-ignore
          class="flex cursor-pointer items-center rounded-sm p-0.5 text-base
            transition outline-none focus-visible:ring-2
            focus-visible:ring-accent hocus:text-text-1"
          :aria-label="muted ? phrase.video_unmute : phrase.video_mute"
          @click="playback.toggleMute()"
        >
          <Icon :name="muted || volume === 0 ? 'volume-off' : 'volume-on'" />
        </button>
        <!-- A phone sets its volume with its own buttons; iOS ignores this. -->
        <MediaRange
          variant="volume"
          data-drag-ignore
          class="hidden pointer-fine:block"
          :max="1"
          :value="muted ? 0 : volume"
          :label="phrase.video_volume"
          @input="playback.setVolume($event)"
        />
      </template>
      <a
        v-if="download"
        :href="sitePath(src)"
        :download="downloadName"
        data-drag-ignore
        class="flex items-center rounded-sm p-0.5 text-base transition
          outline-none focus-visible:ring-2 focus-visible:ring-accent
          hocus:text-text-1"
        :aria-label="phrase.audio_download"
        :data-title-popup="phrase.audio_download"
      >
        <Icon name="download" />
      </a>
    </div>
  </div>
</template>
