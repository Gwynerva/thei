<script lang="ts" setup>
import { mediaVolumeSettable } from '#layers/thei/app/composables/media-volume';

/**
 * A player's sound: the mute button, and the volume slider beside it, on a
 * touch screen as anywhere else. Each player dresses them for its own
 * surface (`buttonClass`, `rangeClass`).
 *
 * The slider is left out only where it could do nothing: on iOS a page
 * cannot set how loud anything plays, and the device's buttons are the one
 * volume there is. The page is drawn with it, and it goes once the browser
 * has said so.
 */
const { volume, muted } = defineProps<{
  volume: number;
  muted: boolean;
  buttonClass?: string;
  rangeClass?: string;
}>();

const emit = defineEmits<{ toggle: []; volume: [value: number] }>();

const settable = ref(true);
onMounted(() => {
  settable.value = mediaVolumeSettable();
});
</script>

<template>
  <button
    type="button"
    data-drag-ignore
    class="flex shrink-0 cursor-pointer items-center"
    :class="buttonClass"
    :aria-label="muted ? phrase.video_unmute : phrase.video_mute"
    @click="emit('toggle')"
  >
    <Icon :name="muted || volume === 0 ? 'volume-off' : 'volume-on'" />
  </button>
  <MediaRange
    v-if="settable"
    variant="volume"
    data-drag-ignore
    :class="rangeClass"
    :max="1"
    :value="muted ? 0 : volume"
    :label="phrase.video_volume"
    @input="emit('volume', $event)"
  />
</template>
