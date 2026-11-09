<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicEntityLink,
} from '#layers/thei/shared/api/public';

/**
 * What an excerpt is about: the word for it, and a chip for each entity, as
 * the visitor may see them. An excerpt about nothing the visitor may see
 * says nothing at all, rather than that it is about something hidden.
 */
const { links } = defineProps<{ links: PublicEntityLink[] }>();

function key(link: PublicEntityLink) {
  return isPublicSecret(link) ? link.key : `${link.entityType}:${link.href}`;
}
</script>

<template>
  <div
    v-if="links.length"
    class="flex min-w-0 flex-wrap items-center gap-xs"
    data-excerpt-about
  >
    <span class="shrink-0 text-xs font-bold text-text-3">{{
      phrase.excerpt_about
    }}</span>
    <PublicRelationChip v-for="link in links" :key="key(link)" :link />
  </div>
</template>
