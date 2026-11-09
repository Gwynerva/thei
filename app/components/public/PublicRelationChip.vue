<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicEntityLink,
} from '#layers/thei/shared/api/public';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import TheiLink from '../TheiLink';

/**
 * One entity an excerpt is about, as a chip on a public page: its picture
 * along the right edge, dissolving into the chip, its name and, under it,
 * the relation's word when it has a direction — the same chip the admin's
 * relations block draws, as a link. A secret is its codename and its drawn
 * icon, never a link.
 */
const { link } = defineProps<{ link: PublicEntityLink }>();

const secret = computed(() => isPublicSecret(link));
const href = computed(() => (isPublicSecret(link) ? undefined : link.href));
const entityType = computed(() => link.entityType ?? 'project');
/** A diary entry is called by its day. */
const title = computed(() =>
  entityListName(
    isPublicSecret(link) ? { title: link.title } : link,
    'abbreviated',
  ),
);
const relationType = computed(() => link.relationType ?? 'related');
const { engaged, events: mediaEvents } = useMediaInteraction();
const accent = computed(() =>
  imageAccentCssColor(link.iconMedia?.accent, 'var(--color-accent)'),
);
</script>

<template>
  <component
    :is="href ? TheiLink : 'span'"
    v-on="mediaEvents"
    :to="href"
    :data-title-popup="title"
    data-title-popup-clipped
    class="public-relation-chip group relative flex h-12 max-w-full min-w-0
      items-center overflow-hidden rounded-sm border border-border-1 text-left
      text-text-1 no-underline transition-colors focus-visible:ring-2
      focus-visible:ring-accent focus-visible:outline-none sm:max-w-72"
    :class="{ 'cursor-pointer': href }"
    :style="{ '--relation-accent': accent }"
    :data-public-secret="secret || undefined"
    :data-relation-href="href"
  >
    <MediaEdge
      :media="link.iconMedia"
      side="right"
      fade="chip"
      playback="interaction"
      :engaged
      class="w-16"
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
      class="relative flex min-w-0 flex-col pr-12 pl-sm text-xs text-halo-bg-3"
    >
      <span
        class="-m-[0.75em] truncate p-[0.75em] font-semibold transition-colors"
        :class="
          secret ? 'text-text-2 italic' : href && 'group-hocus:text-accent'
        "
        data-title-popup-clip
        data-relation-title
        >{{ title }}</span
      >
      <RelationLine
        v-if="relationType !== 'related'"
        :type="relationType"
        class="-m-[0.75em] truncate p-[0.75em] text-text-2"
      />
    </span>
  </component>
</template>

<style scoped>
.public-relation-chip {
  background: var(--color-bg-3);
}

.public-relation-chip:focus-visible {
  border-color: color-mix(in oklab, var(--relation-accent) 80%, transparent);
}

@media (hover: hover) {
  .public-relation-chip[href]:hover {
    border-color: color-mix(in oklab, var(--relation-accent) 80%, transparent);
  }
}
</style>
