<script lang="ts" setup>
import type {
  PublicExcerpt,
  PublicExcerptSecret,
} from '#layers/thei/shared/api/public';
import { excerptAnchorId } from '#layers/thei/shared/content-headings';
import { placeExcerptSecrets } from '#layers/thei/shared/excerpt-secrets';

/**
 * A page's own excerpts in its sidebar, under the contents: each by the
 * picture of what it is about and its title, with what it is about named
 * under it, leading to where it stands on the page. One the reader may not
 * read stands in its place as its codename with a lock, leading nowhere.
 */
const { excerpts, secrets } = defineProps<{
  excerpts: PublicExcerpt[];
  secrets: PublicExcerptSecret[];
}>();

const placed = computed(() => placeExcerptSecrets(excerpts, secrets));

function about(excerpt: PublicExcerpt) {
  const subject = excerpt.about[0];
  return subject ? publicExcerptSubjectName(subject) : undefined;
}

function media(excerpt: PublicExcerpt) {
  return excerpt.about[0]?.iconMedia ?? excerpt.media;
}
</script>

<template>
  <ul class="flex min-w-0 flex-col" data-excerpt-list>
    <li
      v-for="item in placed"
      :key="item.secret ? item.excerpt.key : item.excerpt.publicId"
    >
      <PublicCompactResourceItem
        v-if="item.secret"
        :title="item.excerpt.title"
        :icon-media="item.excerpt.iconMedia"
        icon="excerpt"
        corner-icon="lock-close"
        :corner-title="phrase.secret_hint"
        secret
      />
      <PublicCompactResourceItem
        v-else
        :title="publicText(item.excerpt.title)"
        :description="about(item.excerpt)"
        :href="`#${excerptAnchorId(item.excerpt.publicId)}`"
        :icon-media="media(item.excerpt)"
        icon="excerpt"
      />
    </li>
  </ul>
</template>
