<script lang="ts" setup>
import type { PublicExcerpt } from '#layers/thei/shared/api/public';
import { excerptAnchorId } from '#layers/thei/shared/content-headings';
import { buildExcerptContentHeadings } from '#layers/thei/app/components/content/content-headings';

/**
 * An excerpt whole, on its parent's page, after the parent's own text: a
 * part of the page to a reader and to a machine alike. It is an article of
 * its own under its heading, which is the one link to the excerpt's page,
 * marked as its bookmark; what it is about stands over the heading, turning
 * down to it; its text follows with its headings one level down, each anchored under the
 * excerpt's own anchor, so the page's outline stays one.
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
      gap-sm border-t border-border-1 pt-lg"
  >
    <!-- What it is about over its title, turning down to it; the summary is
         left to its own page, since the text is read whole here. -->
    <header class="flex min-w-0 flex-col gap-xs">
      <PublicPageParent
        v-if="subject"
        :parent="subject"
        arrow
        class="justify-start!"
        data-excerpt-subject
      />
      <h2
        :id="headingId"
        class="flex min-w-0 items-start gap-xs text-xl font-bold tracking-tight
          sm:text-2xl"
      >
        <Icon
          name="excerpt"
          class="mt-[0.2em] shrink-0 text-[0.85em] text-text-3"
          aria-hidden="true"
        />
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
    </header>
    <div
      v-if="excerpt.bannerMedia"
      class="aspect-video w-full overflow-hidden rounded-normal bg-bg-3"
    >
      <Media
        v-bind="excerpt.bannerMedia"
        playback="autoplay"
        autoplay-reduced-motion
        loop
        muted
        class="size-full"
      />
    </div>
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
