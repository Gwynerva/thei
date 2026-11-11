<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { IconName } from '#thei/icons';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

/**
 * A small square picture with softly rounded corners.
 *
 * The token that stands for "another entity" wherever one is mentioned in
 * passing — one of several related entities under a card, what a row of a
 * list is about, an end of a relation: a way to point at something, not a
 * preview of it. On a public page an entity named with its name is an
 * `EntityChip` instead.
 */
const { media, icon } = defineProps<{
  media?: MediaDescriptor;
  /** Drawn in the accent of `media` when there is no picture to show. */
  icon: IconName;
}>();

const accent = computed(() =>
  media?.accent ? imageAccentCssColor(media.accent) : undefined,
);
</script>

<template>
  <span
    class="flex shrink-0 items-center justify-center overflow-hidden rounded-sm
      bg-bg-4"
    :style="accent ? { color: accent } : undefined"
  >
    <Media
      v-if="media && !media.generated"
      v-bind="media"
      playback="autoplay"
      autoplay-reduced-motion
      loop
      muted
      class="size-full"
    />
    <Media v-else-if="media" v-bind="media" class="size-full" />
    <Icon v-else :name="icon" class="size-3/5 text-accent" />
  </span>
</template>
