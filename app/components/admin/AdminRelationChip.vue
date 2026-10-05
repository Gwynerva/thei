<script lang="ts" setup>
import type { RelationEntityType } from '#layers/thei/shared/relation';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import type { MediaDescriptor } from '#layers/thei/shared/media';

/**
 * One entity of the relations block, as a chip: its picture along the right
 * edge, dissolving into the chip, as on the entity's card on a public page,
 * and its name and, under it,
 * whatever the caller says of it (the slot): what the relation is and why,
 * or for a recommendation what kind of thing it is. With nothing to say the
 * name stands alone, in the middle of the chip.
 *
 * Of the chip family of the form — tags, links — and drawn the same way: the
 * plain ground, the entity's own accent on the border under the pointer. A
 * recommendation is outlined on the plain surface instead, as a tag one is.
 *
 * The chip is itself what a drag sort moves, so it eases its colours only:
 * a transition of `transform` would swallow the sort's own slide of the
 * chips making way, and they would jump to their new places.
 */
const { entityType, title, media, suggested } = defineProps<{
  entityType: RelationEntityType;
  /** The entity's name as it is to be shown, formatted by the caller. */
  title: string;
  media?: MediaDescriptor;
  /** Offered rather than chosen: outlined, on the plain surface. */
  suggested?: boolean;
}>();

const { engaged, events: mediaEvents } = useMediaInteraction();

const accent = computed(() =>
  imageAccentCssColor(media?.accent, 'var(--color-accent)'),
);
</script>

<template>
  <button
    v-on="mediaEvents"
    type="button"
    class="relation-chip group relative flex h-12 max-w-full min-w-0
      cursor-pointer items-center overflow-hidden rounded-sm border text-left
      transition-colors focus-visible:outline-none sm:max-w-72"
    :class="
      suggested
        ? 'relation-chip-suggested border-dashed border-border-3'
        : 'border-border-1'
    "
    :style="{ '--relation-accent': accent }"
  >
    <MediaEdge
      :media
      side="right"
      fade="chip"
      playback="interaction"
      :engaged
      class="w-16"
      data-relation-media
    >
      <span
        class="flex size-full items-center justify-end pr-xs text-xl
          text-text-3"
      >
        <Icon :name="relationEntityIcon(entityType)" />
      </span>
    </MediaEdge>
    <!-- A truncated line clips its own halo, which draws a hard seam across
         the picture: each gets room for the halo all round. -->
    <span
      class="relation-chip-text relative flex min-w-0 flex-col pr-12 pl-sm
        text-xs"
    >
      <span
        class="-m-[0.75em] truncate p-[0.75em] font-semibold"
        :class="suggested ? 'text-text-2' : 'text-text-1'"
        data-relation-title
        >{{ title }}</span
      >
      <span class="-m-[0.75em] min-w-0 p-[0.75em] text-text-2">
        <slot />
      </span>
    </span>
  </button>
</template>

<style scoped>
.relation-chip {
  --relation-chip-ground: var(--color-bg-3);
  background: var(--relation-chip-ground);
}

.relation-chip-suggested {
  --relation-chip-ground: var(--color-bg-2);
}

/* The words lie over the picture's dissolving edge: a halo of the chip's
   own ground keeps them legible on any picture. */
.relation-chip-text {
  text-shadow:
    0 0 0.5em var(--relation-chip-ground),
    0 0 0.9em var(--relation-chip-ground);
}

.relation-chip:focus-visible {
  border-color: color-mix(in oklab, var(--relation-accent) 80%, transparent);
  border-style: solid;
}

@media (hover: hover) {
  .relation-chip:hover {
    border-color: color-mix(in oklab, var(--relation-accent) 80%, transparent);
  }
}
</style>
