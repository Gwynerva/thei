<script lang="ts" setup>
/**
 * The bars of a waveform, apart from where the player stands: a player
 * follows the sound every frame, and none of its bars has to be drawn again
 * for it.
 */
defineProps<{ bars: number[] }>();
</script>

<template>
  <span class="flex size-full items-center gap-px">
    <span
      v-for="(bar, index) in bars"
      :key="index"
      class="min-w-px flex-1 rounded-full bg-current"
      :style="{ height: `${bar}%` }"
    />
  </span>
</template>
