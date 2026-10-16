<script lang="ts" setup>
import type { ContentEntityChoice } from '#layers/thei/shared/admin/content-entity-search';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

/**
 * One entity in a picker's list: its picture along the right edge, its
 * kind's glyph and its title — and, with `secondary`, what it belongs to or
 * says of itself on a quieter line under it. `active` is where the keys
 * are; `chosen`, the choice a confirming picker holds, marked in the accent.
 */
const props = defineProps<{
  item: ContentEntityChoice;
  id?: string;
  active?: boolean;
  chosen?: boolean;
  secondary?: boolean;
}>();
defineEmits<{ pick: []; point: [event: PointerEvent] }>();

const detail = computed(() =>
  props.secondary
    ? [props.item.parent?.title, props.item.summary].filter(Boolean).join(' · ')
    : '',
);
</script>

<template>
  <MediaInteraction v-slot="{ engaged, events }">
    <button
      v-on="events"
      :id
      type="button"
      role="option"
      :aria-selected="chosen"
      class="group relative flex w-full shrink-0 cursor-pointer items-center
        overflow-hidden rounded-sm bg-bg-1 text-left transition-colors
        hocus:bg-bg-3"
      :class="[
        secondary ? 'min-h-12' : 'min-h-10 pointer-coarse:min-h-11',
        { 'bg-bg-3': active, 'entity-row-chosen': chosen },
      ]"
      @pointermove="$emit('point', $event)"
      @click="$emit('pick')"
    >
      <MediaEdge
        :media="item.previewMedia"
        side="right"
        fade="preview"
        playback="interaction"
        :engaged
        class="w-24"
      />
      <!-- A truncated line clips its own halo, which draws a hard seam
           across the picture: each gets room for the halo all round. -->
      <span
        class="relative flex min-w-0 flex-1 flex-col gap-0.5 py-1 pr-16 pl-xs
          text-halo-bg-1"
      >
        <span class="flex min-w-0 items-center gap-1 text-sm font-semibold"
          ><Icon
            :name="entityTypeIcon(item.entityType)"
            :aria-label="entityTypeLabel(item.entityType)"
            role="img"
            class="shrink-0 text-xs text-text-2"
          /><span class="-m-[0.75em] min-w-0 truncate p-[0.75em]">{{
            entityDisplayTitle(item)
          }}</span></span
        >
        <span
          v-if="detail"
          class="-m-[0.75em] block truncate p-[0.75em] text-xs text-text-3"
          :class="{ italic: item.date }"
          >{{ detail }}</span
        >
      </span>
    </button>
  </MediaInteraction>
</template>

<style scoped>
/*
 * The choice a confirming picker holds, marked in the accent. An outline is
 * drawn over the picture along the edge, where an inset shadow would not be.
 */
.entity-row-chosen {
  background-color: color-mix(
    in oklab,
    var(--color-accent) 12%,
    var(--color-bg-1)
  );
  outline: 1.5px solid var(--color-accent);
  outline-offset: -1.5px;
}
</style>
