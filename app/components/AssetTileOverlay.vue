<script lang="ts" setup>
import type { MediaKind } from '#layers/thei/shared/media';
import { useHumanSize } from '#layers/thei/app/composables/human-size';

withDefaults(
  defineProps<{
    mediaKind?: MediaKind;
    size?: number;
    isPrivate?: boolean;
    extension?: string;
    showVideo?: boolean;
    showSize?: boolean;
    showExtension?: boolean;
    editable?: boolean;
  }>(),
  {
    showVideo: true,
    showSize: false,
    showExtension: false,
    editable: false,
  },
);

const formatSize = useHumanSize();
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-40 select-none">
    <div
      v-if="isPrivate"
      class="absolute top-1 left-1 rounded-full bg-black/30 p-1 text-xs
        text-white backdrop-blur-sm"
    >
      <Icon name="lock-close" />
    </div>

    <div
      v-if="showVideo && mediaKind === 'video'"
      class="absolute top-1 right-1 rounded-full bg-black/30 p-1 text-xs
        leading-none text-white backdrop-blur-sm"
    >
      <Icon name="play-circle" />
    </div>

    <div
      v-if="showSize && size != null"
      class="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/30 p-1
        text-xs leading-none whitespace-nowrap text-white backdrop-blur-sm"
    >
      {{ formatSize(size) }}
    </div>

    <div
      v-else-if="showExtension && extension"
      class="absolute right-1 bottom-1 rounded bg-black/30 px-1 py-0.5 text-xs
        leading-none text-white uppercase backdrop-blur-sm"
    >
      {{ extension }}
    </div>

    <div
      v-if="editable"
      class="absolute inset-0 flex items-center justify-center bg-bg-1/60
        opacity-0 transition group-hocus:opacity-100"
    >
      <Icon name="edit" class="text-2xl text-text-1" />
    </div>

    <slot />
  </div>
</template>
