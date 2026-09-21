<script setup lang="ts">
import TheiLink from '../TheiLink';
import type { ProfilePageLink } from '#layers/thei/shared/profile';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

const props = defineProps<{
  page: ProfilePageLink;
  linked?: boolean;
}>();
const { engaged, events } = useMediaInteraction();

/**
 * The page's own icon decides the colour it lights up in. A row of pinned
 * pages that all borrowed the site accent looked like one button repeated.
 */
const accent = computed(() => imageAccentCssColor(props.page.media?.accent));
</script>

<template>
  <component
    :is="linked ? TheiLink : 'div'"
    v-on="events"
    :to="linked ? page.href : undefined"
    class="pinned-page group relative flex size-full min-h-14 min-w-0
      items-center overflow-hidden text-text-1 no-underline transition-colors"
    :class="
      linked
        ? `rounded-normal border border-border-1 bg-bg-1 focus-visible:ring-2
          focus-visible:ring-accent focus-visible:outline-none`
        : undefined
    "
    :style="{ '--pinned-page-accent': accent }"
  >
    <MediaEdge :media="page.media" playback="interaction" :engaged class="w-24">
      <span class="flex size-full items-center pl-sm text-2xl text-text-3">
        <Icon name="page" />
      </span>
    </MediaEdge>
    <span
      class="relative ml-10 min-w-0 flex-1 py-xs pr-sm font-semibold
        transition-colors"
    >
      {{ publicText(page.title) }}
    </span>
    <Icon
      v-if="linked"
      name="chevron-right"
      class="relative mr-sm shrink-0 text-text-3 transition-colors"
    />
  </component>
</template>

<style scoped>
.pinned-page:hover,
.pinned-page:focus-within {
  border-color: color-mix(in oklab, var(--pinned-page-accent) 40%, transparent);
  background-color: color-mix(
    in oklab,
    var(--pinned-page-accent) 12%,
    transparent
  );
  color: var(--pinned-page-accent);
}

.pinned-page:hover :deep(svg),
.pinned-page:focus-within :deep(svg) {
  color: var(--pinned-page-accent);
}
</style>
