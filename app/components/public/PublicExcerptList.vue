<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicExcerpt,
} from '#layers/thei/shared/api/public';
import { excerptAnchorId } from '#layers/thei/shared/content-headings';

/**
 * A page's own excerpts in its sidebar, under the contents: each by the
 * picture of what it is about and its title, leading to where it stands on
 * the page. Where an excerpt is about several things, the first names it
 * and the rest are counted.
 */
const { excerpts } = defineProps<{ excerpts: PublicExcerpt[] }>();

function about(excerpt: PublicExcerpt) {
  const names = excerpt.about.map((link) =>
    isPublicSecret(link) ? link.title : entityListName(link, 'abbreviated'),
  );
  if (!names.length) return undefined;
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
}

function media(excerpt: PublicExcerpt) {
  return excerpt.about[0]?.iconMedia ?? excerpt.media;
}
</script>

<template>
  <ul class="flex min-w-0 flex-col" data-excerpt-list>
    <li v-for="excerpt in excerpts" :key="excerpt.publicId">
      <PublicCompactResourceItem
        :title="publicText(excerpt.title)"
        :description="about(excerpt)"
        :href="`#${excerptAnchorId(excerpt.publicId)}`"
        :icon-media="media(excerpt)"
        icon="excerpt"
      />
    </li>
  </ul>
</template>
