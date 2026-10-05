<script lang="ts" setup>
import type { PublicAssetDescriptor } from '#layers/thei/shared/api/public';

/**
 * A showcase tile in the project's hero. A video plays while the tile is
 * pointed at or focused, and wears the mark every other tile of a video
 * does, as `AssetTile` does.
 */
defineProps<{ item: PublicAssetDescriptor }>();
const emit = defineEmits<{ open: [] }>();
const { engaged, events } = useMediaInteraction();
</script>

<template>
  <button
    type="button"
    class="group relative size-24 shrink-0 cursor-zoom-in overflow-hidden
      rounded-normal border-2 border-white/15 bg-black/16 shadow-md transition
      sm:size-30 hocus:-translate-y-0.5 hocus:border-white/35 hocus:bg-black/24
      hocus:shadow-xl"
    :aria-label="publicText(item.title) || phrase.asset"
    :data-title-popup="publicText(item.title) || phrase.asset"
    v-on="events"
    @click="emit('open')"
  >
    <Media
      v-if="item.media"
      v-bind="item.media"
      playback="interaction"
      :engaged
      muted
      fit="contain"
      backdrop
      class="size-full"
    />
    <FilePreview v-else :extension="item.extension" class="size-full p-xs" />
    <span
      class="absolute inset-0 bg-black/0 transition group-hocus:bg-black/8"
      aria-hidden="true"
    ></span>
    <AssetTileOverlay v-if="item.media" :media-kind="item.media.kind" />
  </button>
</template>
