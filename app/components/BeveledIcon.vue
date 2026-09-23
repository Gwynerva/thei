<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { IconName } from '#thei/icons';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

/**
 * A small square picture with its corners cut off.
 *
 * The shape that stands for "another entity" wherever one is mentioned in
 * passing — a related project under a card, the parent project above a
 * stage. A cut corner reads as a token rather than as a thumbnail, which is
 * what these are: a way to point at something, not a preview of it.
 */
const { media, icon, plain } = defineProps<{
  media?: MediaDescriptor;
  /** Drawn in the accent of `media` when there is no picture to show. */
  icon: IconName;
  /** No backing tile: the picture alone, as on a page header. */
  plain?: boolean;
}>();

const accent = computed(() =>
  media?.accent ? imageAccentCssColor(media.accent) : undefined,
);
</script>

<template>
  <span
    class="beveled flex shrink-0 items-center justify-center overflow-hidden"
    :class="plain ? '' : 'bg-bg-4'"
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

<style scoped>
/* One cut per corner, proportional so the shape holds at every size. */
.beveled {
  clip-path: polygon(
    20% 0,
    80% 0,
    100% 20%,
    100% 80%,
    80% 100%,
    20% 100%,
    0 80%,
    0 20%
  );
}
</style>
