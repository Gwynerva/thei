<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';

/**
 * The first media of a piece of content, dissolving from the left edge of a
 * row that previews it. Text of the row starts past the strip's window with
 * `ml-md sm:ml-12`, and reads over what remains of it with a halo of the row's
 * own background.
 */
defineProps<{ media: MediaDescriptor; engaged?: boolean }>();
</script>

<template>
  <MediaEdge
    :media
    fade="preview"
    playback="interaction"
    :engaged
    class="w-32"
  />
</template>
