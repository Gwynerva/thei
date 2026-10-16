<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

/**
 * One place a file is used in, as a chip of the relations block's kind: the
 * place's picture along the right edge, dissolving into the chip, or its
 * kind's icon; its name; under it, how the file is used there. A section
 * says its project above its name, from the chip's left edge, the arrow
 * going down from it to the section. Every text comes formatted.
 */
const { media, href } = defineProps<{
  /** Where the chip leads, without the base path. */
  href?: string;
  /** The admin's editors open beside the window, in a tab of their own. */
  newTab?: boolean;
  hint?: string;
  media?: MediaDescriptor;
  icon: IconName;
  title: string;
  parent?: string;
  uses: string;
  /** How many of the uses are private: the admin's window says so. */
  privateCount?: number;
}>();

const { engaged, events: mediaEvents } = useMediaInteraction();
const accent = computed(() =>
  imageAccentCssColor(media?.accent, 'var(--color-accent)'),
);
</script>

<template>
  <component
    :is="href ? 'a' : 'div'"
    v-on="mediaEvents"
    :href="href ? sitePath(href) : undefined"
    :target="href && newTab ? '_blank' : undefined"
    :rel="href && newTab ? 'noopener' : undefined"
    :data-title-popup="hint"
    class="group relative flex min-h-12 min-w-0 items-center overflow-hidden
      rounded-normal border border-border-1 bg-bg-3 text-left no-underline
      transition-colors focus-visible:ring-2 focus-visible:ring-accent
      focus-visible:outline-none hocus:border-(--usage-accent)"
    :style="{ '--usage-accent': accent }"
    data-asset-usage
  >
    <MediaEdge
      :media
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
        <Icon :name="icon" />
      </span>
    </MediaEdge>
    <!-- A truncated line clips its own halo: each line gets room for it. -->
    <span
      class="relative flex min-w-0 flex-1 flex-col py-1.5 pr-14 pl-xs text-xs
        text-halo-bg-3"
    >
      <span
        v-if="parent"
        class="-m-[0.5em] flex min-w-0 items-center gap-1 p-[0.5em] text-2xs
          font-semibold text-text-3"
        data-asset-usage-parent
      >
        <Icon name="corner-down" class="shrink-0 -scale-x-100" />
        <Icon name="project" class="shrink-0" />
        <span class="min-w-0 truncate">{{ parent }}</span>
      </span>
      <span
        class="-m-[0.5em] truncate p-[0.5em] font-semibold text-text-1"
        data-asset-usage-title
        >{{ title }}</span
      >
      <span
        class="-m-[0.5em] flex min-w-0 items-center gap-1 p-[0.5em] text-2xs
          text-text-2"
      >
        <span class="min-w-0 truncate" data-asset-usage-uses>{{ uses }}</span>
        <template v-if="privateCount">
          <span aria-hidden="true">·</span>
          <span
            class="flex shrink-0 items-center gap-0.5 tabular-nums"
            :aria-label="phrase.asset_private_access"
            :data-title-popup="phrase.asset_private_access"
            ><Icon name="lock-close" />{{ privateCount }}</span
          >
        </template>
      </span>
    </span>
  </component>
</template>
