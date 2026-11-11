<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';

/**
 * The head of an excerpt on its parent's page: its words on the page's own
 * ground, with the excerpt's own picture along the right edge,
 * dissolving towards them. No box and no border around it: the left side is
 * the page itself, so the words start where the text under them does, and
 * only the picture's own corners are rounded. The picture stays as it is
 * under the pointer: the head is no link, and nothing in it opens.
 */
defineProps<{ media?: MediaDescriptor; as?: string }>();
</script>

<template>
  <component
    :is="as ?? 'div'"
    class="relative isolate flex min-w-0 overflow-hidden rounded-normal"
  >
    <MediaEdge
      v-if="media"
      :media
      side="right"
      fade="card"
      media-class="opacity-75"
      class="w-full"
      data-excerpt-media
    />
    <div
      class="relative flex min-w-0 flex-col gap-xs py-sm text-halo-bg-1"
      :class="media ? 'max-w-4/5' : 'w-full'"
    >
      <slot />
    </div>
  </component>
</template>
