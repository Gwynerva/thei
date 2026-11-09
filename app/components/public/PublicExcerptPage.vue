<script lang="ts" setup>
import type { PublicExcerptResponse } from '#layers/thei/shared/api/public';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import { EXCERPT_TEXT_ANCHOR } from '#layers/thei/shared/content-headings';
import {
  createdAndUpdatedTimelineItems,
  type PublicDetailPanelData,
} from './public-detail';

/**
 * An excerpt's own page, under whichever parent it belongs to: "Excerpt 2
 * of 3 in" its parent above its title, then "About" what it is about,
 * turning down to the title, then its text, with
 * the excerpts beside it among its parent's in the sidebar. The three
 * routes under a diary entry, an event and a project share it.
 */
const { data } = defineProps<{ data: PublicExcerptResponse }>();

/** The parent as it is called: a diary entry by its day. */
const parentName = computed(() =>
  entityListName({ title: data.parent.title, date: data.parent.date }),
);
// "Excerpt 2 of 3 in" the parent, or "Excerpt in" it when it is the one.
const parentLine = computed(() => ({
  label:
    data.position.count > 1
      ? phrase.value.public_excerpt_position_in(
          data.position.number,
          data.position.count,
        )
      : phrase.value.public_excerpt_in,
  href: data.parent.href,
  title: parentName.value,
  iconMedia: data.parent.media,
  icon: entityTypeIcon(data.parent.type),
}));
/** "About" what it is about, turning down to the title; none once deleted. */
const subjectLine = computed(() =>
  publicExcerptSubjectLine(data.about, phrase.value.public_excerpt_about),
);
/** What the excerpt is, where it has no summary to say so. */
const description = computed(() => {
  if (data.summary) return data.summary;
  switch (data.parent.type) {
    case 'project':
      return phrase.value.excerpt_of_project(data.parent.title);
    case 'event':
      return phrase.value.excerpt_of_event(data.parent.title);
    case 'diary-entry':
      return phrase.value.excerpt_of_diary_entry(parentName.value);
  }
});
const parentAnchor = computed(
  () =>
    ({ project: 'project', event: 'event', 'diary-entry': 'diary-entry' })[
      data.parent.type
    ],
);

const ogImage = useOgImage(() => ({ kind: 'excerpt', id: data.publicId }));
const seoImage = computed(() =>
  publicSeoImage(data.bannerMedia ?? data.media, ogImage.value?.url),
);
usePublicSeo({
  ogImage,
  markdown: true,
  ogType: 'article',
  // The parent is the context an excerpt is read in, so the tab and a
  // shared link name it: "Excerpt - Parent - Owner".
  title: () => `${data.title} - ${parentName.value}`,
  description,
  canonical: () => data.href,
  noIndex: () => data.parent.access === 'link-only',
  breadcrumbs: () => [{ name: parentName.value, path: data.parent.href }],
  image: seoImage,
  entities: () => [
    {
      '@type': 'Article',
      '@id': '#excerpt',
      headline: data.title,
      description: description.value,
      author: publicSeoOwner,
      datePublished: data.chronology.createdAt,
      ...(data.chronology.updatedAt
        ? { dateModified: data.chronology.updatedAt }
        : {}),
      ...(seoImage.value ? { image: seoImage.value } : {}),
      isPartOf: {
        '@type':
          data.parent.type === 'project'
            ? 'CreativeWork'
            : data.parent.type === 'event'
              ? 'Article'
              : 'BlogPosting',
        '@id': `${data.parent.href}#${parentAnchor.value}`,
        name: parentName.value,
        url: data.parent.href,
      },
      // What it is about, as the visitor may see it: never a codename.
      ...(data.about.some((link) => !('secret' in link))
        ? {
            about: data.about.flatMap((link) =>
              'secret' in link
                ? []
                : [
                    {
                      '@type': 'Thing',
                      name: entityListName(link),
                      url: link.href,
                    },
                  ],
            ),
          }
        : {}),
    },
  ],
});

const details = computed(
  () =>
    ({
      neighbours: data.neighbours && { kind: 'excerpt', ...data.neighbours },
      chronology: createdAndUpdatedTimelineItems(data.chronology, {
        created: phrase.value.excerpt_chronology_created,
        updated: phrase.value.excerpt_chronology_updated,
      }),
    }) satisfies PublicDetailPanelData,
);
</script>

<template>
  <main class="flex flex-col">
    <!-- A banner opens the page with it; without one, the plain header. -->
    <PublicHero
      v-if="data.bannerMedia"
      :title="data.title"
      :summary="data.summary"
      :banner-media="data.bannerMedia"
      :parent="parentLine"
      :subject="subjectLine"
    />
    <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
      <PublicPageHeader
        v-if="!data.bannerMedia"
        icon="excerpt"
        :title="data.title"
        :description="data.summary"
        :parent="parentLine"
        :subject="subjectLine"
      />
      <PublicDetailLayout
        :details="details"
        :content="data.content"
        :content-start="{
          id: EXCERPT_TEXT_ANCHOR,
          title: phrase.public_excerpt_text,
        }"
      >
        <ContentRenderer
          v-if="data.content.blocks.length"
          :id="EXCERPT_TEXT_ANCHOR"
          :data="data.content"
          asset-viewer
          class="scroll-mt-[var(--public-anchor-offset,8rem)]"
        />
        <!-- An excerpt always has a text; one that shows nothing has a body
             the visitor may not read. -->
        <PublicEmptyState
          v-else
          :title="phrase.public_excerpt_content_empty"
          :description="phrase.public_excerpt_content_empty_description"
        />
      </PublicDetailLayout>
    </div>
  </main>
</template>
