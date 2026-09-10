<script setup lang="ts">
import TheiLink from '../TheiLink';
import type { ProfilePageLink } from '#layers/thei/shared/profile';

const props = defineProps<{
  page: ProfilePageLink;
  linked?: boolean;
}>();
const { engaged, events } = useMediaInteraction();
</script>

<template>
  <component
    :is="linked ? TheiLink : 'div'"
    v-on="events"
    :to="linked ? page.href : undefined"
    class="group relative flex size-full min-h-14 min-w-0 items-center
      overflow-hidden text-text-1 no-underline transition-colors"
    :class="
      linked
        ? `rounded-normal border border-border-1 bg-bg-1 focus-visible:ring-2
          focus-visible:ring-accent focus-visible:outline-none
          hocus:border-accent/30 hocus:bg-bg-accent`
        : undefined
    "
  >
    <span
      class="page-preview absolute inset-y-0 left-0 w-24"
      aria-hidden="true"
    >
      <Media
        v-if="page.media"
        v-bind="page.media"
        variant="ambient"
        playback="interaction"
        :engaged
        align="left"
        class="size-full opacity-75 transition group-hocus:opacity-100"
      />
      <span
        v-else
        class="flex size-full items-center pl-sm text-2xl text-text-3"
      >
        <Icon name="page" />
      </span>
    </span>
    <span
      class="relative ml-10 min-w-0 flex-1 py-xs pr-sm font-semibold
        transition-colors group-hocus:text-accent"
    >
      {{ page.title }}
    </span>
    <Icon
      v-if="linked"
      name="chevron-right"
      class="relative mr-sm shrink-0 text-text-3 transition-colors
        group-hocus:text-accent"
    />
  </component>
</template>

<style scoped>
.page-preview {
  mask-image: linear-gradient(
    to right,
    #000 0%,
    rgb(0 0 0 / 70%) 20%,
    rgb(0 0 0 / 10%) 75%,
    transparent 100%
  );
}
</style>
