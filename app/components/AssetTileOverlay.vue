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
    /** Unused asset that cleanup is going to delete. */
    pendingDeletion?: boolean;
    /** Why the asset cannot be chosen here, shown as a warning badge. */
    warning?: string;
  }>(),
  {
    showVideo: true,
    showSize: false,
    showExtension: false,
    editable: false,
  },
);

const formatSize = useHumanSize();
const chip = 'bg-black/30 text-xs leading-none text-white backdrop-blur-sm';
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-40 select-none">
    <div
      class="absolute inset-x-1 top-1 flex items-start justify-between gap-1"
    >
      <span class="flex min-w-0 gap-1">
        <span v-if="isPrivate" :class="chip" class="rounded-full p-1">
          <Icon name="lock-close" />
        </span>
        <span
          v-if="pendingDeletion"
          :class="chip"
          class="rounded-full p-1 text-text-error"
          data-asset-pending-deletion
        >
          <Icon name="delete" />
        </span>
        <span
          v-if="warning"
          :class="chip"
          class="rounded-full p-1 text-text-warning"
          :aria-label="warning"
          role="img"
        >
          <Icon name="warning" />
        </span>
      </span>
      <span
        v-if="showVideo && mediaKind === 'video'"
        :class="chip"
        class="shrink-0 rounded-full p-1"
      >
        <Icon name="play-circle" />
      </span>
    </div>

    <div
      v-if="(showExtension && extension) || (showSize && size != null)"
      class="absolute inset-x-1 bottom-1 flex items-end justify-between gap-1"
    >
      <span
        v-if="showExtension && extension"
        :class="chip"
        class="min-w-0 truncate rounded px-1 py-0.5 uppercase"
      >
        {{ extension }}
      </span>
      <span
        v-if="showSize && size != null"
        :class="[chip, showExtension && extension ? 'ml-auto' : 'mx-auto']"
        class="min-w-0 truncate rounded px-1 py-0.5 whitespace-nowrap"
      >
        {{ formatSize(size) }}
      </span>
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
