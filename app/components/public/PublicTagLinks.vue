<script lang="ts" setup>
import type { PublicTagSummary } from '#layers/thei/shared/api/public';
import { tagAccentCssColor } from '#layers/thei/shared/tag';
import { buildTagUrl } from '#layers/thei/shared/tag-url';

withDefaults(
  defineProps<{
    tags: PublicTagSummary[];
    /**
     * `lg` is for a hero, where tags sit over a banner and the default size
     * disappears against the image.
     */
    size?: 'default' | 'lg';
  }>(),
  { size: 'default' },
);
</script>

<template>
  <div
    v-if="tags.length"
    class="flex flex-wrap items-center gap-x-3 gap-y-2"
    :class="size === 'lg' ? 'text-base' : 'text-sm'"
  >
    <TheiLink
      v-for="tag in tags"
      :key="tag.publicId"
      :to="buildTagUrl(tag.slug, tag.publicId)"
      class="pointer-events-auto relative z-3 inline-flex max-w-full
        items-center gap-[0.4em] leading-none font-normal transition
        focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none hocus:underline hocus:brightness-125"
      :style="{ color: tagAccentCssColor(tag) }"
    >
      <span
        class="inline-flex size-[1.15em] shrink-0 items-center justify-center
          overflow-hidden"
      >
        <Media
          v-if="tag.iconMedia"
          v-bind="tag.iconMedia"
          class="size-full rounded-[0.2em]"
        />
        <Icon v-else name="tag" class="size-full" />
      </span>
      <span class="min-w-0 break-words">{{ publicText(tag.title) }}</span>
    </TheiLink>
  </div>
</template>
