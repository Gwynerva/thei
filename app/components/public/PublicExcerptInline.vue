<script lang="ts" setup>
import type { PublicExcerpt } from '#layers/thei/shared/api/public';
import { excerptAnchorId } from '#layers/thei/shared/content-headings';
import { buildExcerptContentHeadings } from '#layers/thei/app/components/content/content-headings';

/**
 * An excerpt whole, on its parent's page, after the parent's own text: a
 * part of the page to a reader and to a machine alike. It is an article of
 * its own under its heading, which is the one link to the excerpt's page,
 * marked as its bookmark; what it is about stands over the heading as its
 * chip, an arrow coming up from the heading to it; its text follows with its
 * headings one level down, each anchored under the excerpt's own anchor, so
 * the page's outline stays one.
 */
const { excerpt } = defineProps<{ excerpt: PublicExcerpt }>();

const id = computed(() => excerptAnchorId(excerpt.publicId));
const headingId = computed(() => `${id.value}-title`);
const headings = computed(() =>
  buildExcerptContentHeadings(excerpt, language.value.slugify),
);
const title = computed(() => publicText(excerpt.title));
const subject = computed(() => publicExcerptSubjectLine(excerpt.about));
</script>

<script lang="ts">
import type { PublicSeoEntity } from '#layers/thei/app/composables/public-seo';

/**
 * A parent's excerpts in its structured data: the same nodes the excerpts'
 * own pages describe, by their @id, as parts of the parent.
 */
export function publicExcerptParts(excerpts: PublicExcerpt[]): {
  hasPart?: PublicSeoEntity[];
} {
  return excerpts.length
    ? {
        hasPart: excerpts.map((part) => ({
          '@type': 'Article',
          '@id': `${part.href}#excerpt`,
          headline: part.title,
          url: part.href,
        })),
      }
    : {};
}
</script>

<template>
  <article
    :id="id"
    :aria-labelledby="headingId"
    :data-excerpt="excerpt.publicId"
    class="flex min-w-0 scroll-mt-[var(--public-anchor-offset,8rem)] flex-col
      gap-sm"
  >
    <!-- Its head is a block of its own: what it is about over its title,
         as its chip, an arrow coming up from the title to it, and the
         excerpt's own picture — its banner, or the first of its text —
         along the right edge. The summary is left to its own page, since
         the text is read whole here. No icon of an excerpt before the
         title: that one marks the block of excerpts written elsewhere
         about the page. -->
    <PublicExcerptHead as="header" :media="excerpt.media" data-excerpt-head>
      <PublicPageParent
        v-if="subject"
        :parent="subject"
        arrow="start"
        class="justify-start!"
        data-excerpt-subject
      />
      <h2
        :id="headingId"
        class="min-w-0 text-xl font-bold tracking-tight sm:text-2xl"
      >
        <TheiLink
          :to="excerpt.href"
          rel="bookmark"
          :data-title-popup="phrase.excerpt_page_hint"
          class="min-w-0 text-text-1 no-underline transition
            focus-visible:rounded-sm focus-visible:ring-2
            focus-visible:ring-accent focus-visible:outline-none
            hocus:text-accent"
          >{{ title }}</TheiLink
        >
      </h2>
    </PublicExcerptHead>
    <!-- Its banner is left to its cards and its own page: here the text
         follows the head at once. -->
    <ContentRenderer
      v-if="excerpt.content.blocks.length"
      :data="excerpt.content"
      :content-headings="headings"
      :heading-shift="1"
      asset-viewer
    />
    <PublicEmptyState
      v-else
      :title="phrase.public_excerpt_content_empty"
      :description="phrase.public_excerpt_content_empty_description"
    />
  </article>
</template>
