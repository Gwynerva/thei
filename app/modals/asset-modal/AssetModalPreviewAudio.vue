<script lang="ts" setup>
/**
 * A recording where a picture would be shown: its player, and, once a new
 * version of it is made, that one under it. Only one plays at a time, so
 * playing one after the other is a comparison by ear.
 */
defineProps<{
  players: {
    key: string;
    /** Site path, an object URL for a file not stored yet. */
    src: string;
    extension?: string;
    duration?: number;
    peaks?: number[];
    label?: string;
  }[];
}>();
</script>

<template>
  <div class="flex w-full max-w-160 flex-col gap-md p-md" data-audio-preview>
    <section
      v-for="player of players"
      :key="player.key"
      class="flex flex-col gap-xs rounded-normal border border-border-1 bg-bg-2
        p-sm"
    >
      <span v-if="player.label" class="text-sm font-semibold text-text-2">
        {{ player.label }}
      </span>
      <AudioPlayer
        :src="player.src"
        :extension="player.extension"
        :duration="player.duration"
        :peaks="player.peaks"
      />
    </section>
  </div>
</template>
