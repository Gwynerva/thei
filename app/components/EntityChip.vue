<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import {
  vEntityCard,
  type EntityCardData,
} from '#layers/thei/app/composables/entity-cards';
import TheiLink from './TheiLink';

/**
 * Another entity named in a line, as a chip of one line: its name, and its
 * picture along the right edge, dissolving into the chip (`MediaEdge`), or
 * its kind's icon there while it has none. Of the family of the relation and
 * file-usage chips: the plain ground, the entity's own accent on the border
 * under the pointer. A link wherever the reader may open the entity; one
 * they may not is its codename in italics, leading nowhere. Resting on it
 * shows the entity's card (`card`), as a link in a text does.
 */
const {
  media,
  href,
  size = 'md',
} = defineProps<{
  /** The entity's name as it is to be shown, formatted by the caller. */
  title: string;
  /** Without the base path; none for what the reader may not open. */
  href?: string;
  media?: MediaDescriptor;
  /** The kind's icon, shown while the entity has no picture. */
  icon: IconName;
  /** `sm` on a card or in a line of small words. */
  size?: 'sm' | 'md';
  /** Over a banner's dark hero, in white as everything there is. */
  onDark?: boolean;
  card?: EntityCardData;
}>();

const { engaged, events: mediaEvents } = useMediaInteraction();
const accent = computed(() =>
  imageAccentCssColor(media?.accent, 'var(--color-accent)'),
);
</script>

<template>
  <component
    :is="href ? TheiLink : 'span'"
    v-on="mediaEvents"
    v-entity-card="card"
    :to="href"
    class="entity-chip group relative inline-flex max-w-full min-w-0
      items-center overflow-hidden rounded-sm border font-semibold no-underline
      transition-colors focus-visible:ring-2 focus-visible:outline-none"
    :class="[
      size === 'sm' ? 'h-6 text-xs' : 'h-7 text-sm',
      onDark
        ? `entity-chip-dark border-white/12 text-white/90
          focus-visible:ring-white`
        : 'border-border-1 focus-visible:ring-accent',
      onDark ? '' : href ? 'text-text-1' : 'text-text-3',
      { italic: !href },
    ]"
    :style="{ '--entity-chip-accent': accent }"
    data-entity-chip
  >
    <MediaEdge
      :media
      side="right"
      fade="chip"
      playback="interaction"
      :engaged
      :class="size === 'sm' ? 'w-12' : 'w-16'"
    >
      <span
        class="flex size-full items-center justify-end pr-1.5"
        :class="onDark ? 'text-white/60' : 'text-text-3'"
      >
        <Icon :name="icon" />
      </span>
    </MediaEdge>
    <!-- A truncated line clips its own halo, which draws a hard seam across
         the picture: it gets room for the halo all round. -->
    <span
      class="text-halo-(--entity-chip-ground) relative min-w-0 truncate
        py-[0.75em] pl-xs"
      :class="size === 'sm' ? 'pr-9' : 'pr-12'"
      data-entity-chip-title
      >{{ title }}</span
    >
  </component>
</template>

<style scoped>
.entity-chip {
  --entity-chip-ground: var(--color-bg-3);
  background: var(--entity-chip-ground);
}

/* The hero is dark in either theme: the chip is a pane of it, as its pills. */
.entity-chip-dark {
  --entity-chip-ground: rgb(0 0 0 / 55%);
  background: rgb(255 255 255 / 9%);
}

.entity-chip:is(a):is(:focus-visible, [data-popup-open]) {
  border-color: color-mix(in oklab, var(--entity-chip-accent) 80%, transparent);
}

@media (hover: hover) {
  .entity-chip:is(a):hover {
    border-color: color-mix(
      in oklab,
      var(--entity-chip-accent) 80%,
      transparent
    );
  }
}
</style>
