<script lang="ts" setup>
import type { ContentEntityType } from '#layers/thei/shared/content-link';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

/**
 * What a place is a part of — a section's project, an excerpt's parent — as
 * the line over the place's name: the arrow going down to the name, the icon
 * of the parent's kind and its name, a diary entry by its day. The size of
 * the words is the caller's.
 */
defineProps<{
  parent: { type: ContentEntityType; title?: string; date?: string };
  /** The name shows itself whole in a hint when it is cut. */
  clipped?: boolean;
}>();
</script>

<template>
  <span class="flex min-w-0 items-center gap-1 font-semibold text-text-3">
    <Icon name="corner-down" class="shrink-0 -scale-x-100" />
    <Icon :name="entityTypeIcon(parent.type)" class="shrink-0" />
    <span
      class="min-w-0 truncate"
      :data-title-popup-clipped="clipped ? '' : undefined"
      >{{ entityListName(parent) }}</span
    >
  </span>
</template>
