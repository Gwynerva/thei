<script lang="ts" setup>
import type { PublicDiaryResponse } from '#layers/thei/shared/api/public';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildLifeUrl } from '#layers/thei/shared/life';
import {
  createdAndUpdatedTimelineItems,
  type PublicDetailPanelData,
} from '#layers/thei/app/components/public/public-detail';
import { publicOwnerNotesHeading } from '#layers/thei/app/components/public/PublicOwnerNotes.vue';
import {
  publicRelatedHeading,
  publicRelatedTotal,
} from '#layers/thei/app/components/public/PublicRelatedBlock.vue';
import { publicExcerptsHeading } from '#layers/thei/app/components/public/PublicExcerptsBlock.vue';
import { buildExcerptContentsEntries } from '#layers/thei/app/components/content/content-headings';
import { publicExcerptParts } from '#layers/thei/app/components/public/PublicExcerptInline.vue';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicDiaryResponse>(
  () => `/api/diary/${encodeURIComponent(String(route.params.date))}`,
);
const data = useRequiredResource(resource);
const canonical = computed(() => buildDiaryUrl(data.value.date));
const relatedUrl = computed(
  () => `/api/diary/${encodeURIComponent(data.value.date)}/related`,
);
const excerptsUrl = computed(
  () => `/api/diary/${encodeURIComponent(data.value.date)}/excerpts`,
);
if (route.path !== canonical.value)
  await navigateTo(canonical.value, { redirectCode: 301 });

/**
 * An entry has no title, so its day is the heading everywhere.
 *
 * Spelled out in full rather than as "three weeks ago": the day is what this
 * entry *is*, and a label that reads differently next month would make the
 * page look like a different one.
 */
const heading = computed(() =>
  formatAbsolutePublicDate(data.value.date, language.value.code),
);

const ogImage = useOgImage(() => ({ kind: 'diary', id: data.value.date }));
const seoImage = computed(() =>
  publicSeoImage(data.value.media, ogImage.value?.url),
);
/**
 * When the entry last changed, if after its day. An entry is published on
 * the day it is about, which may be long before it was typed in.
 */
const seoModified = computed(() => {
  const { createdAt, updatedAt } = data.value.chronology;
  const latest = updatedAt ?? createdAt;
  return latest > data.value.date ? latest : undefined;
});
usePublicSeo({
  ogImage,
  markdown: true,
  ogType: 'article',
  title: () => heading.value,
  description: () => phrase.value.diary_entry_seo_description(heading.value),
  canonical,
  noIndex: () => data.value.access === 'link-only',
  breadcrumbs: () => [
    {
      name: phrase.value.diary_seo_title,
      path: buildLifeUrl({ filter: ['diary-entry'] }),
    },
  ],
  image: seoImage,
  entities: () => [
    {
      '@type': 'BlogPosting',
      '@id': '#diary-entry',
      headline: heading.value,
      author: publicSeoOwner,
      datePublished: data.value.date,
      ...(seoModified.value ? { dateModified: seoModified.value } : {}),
      ...(seoImage.value ? { image: seoImage.value } : {}),
      ...publicExcerptParts(data.value.excerpts),
    },
  ],
});

const details = computed(
  () =>
    ({
      neighbours: data.value.neighbours && {
        kind: 'diary-entry',
        ...data.value.neighbours,
      },
      excerpts: data.value.excerpts,
      // The day the entry is about is its heading, not a technical date.
      chronology: createdAndUpdatedTimelineItems(data.value.chronology, {
        created: phrase.value.diary_chronology_created,
        updated: phrase.value.diary_chronology_updated,
      }),
    }) satisfies PublicDetailPanelData,
);

/**
 * The sections below the entry that belong in its table: its excerpts, each
 * with the headings of its text, the excerpts about it, what it is related
 * to, then the owner's notes, which nobody else gets at all.
 */
const extraContents = computed(() => [
  ...data.value.excerpts.flatMap((excerpt) =>
    buildExcerptContentsEntries(excerpt, language.value.slugify),
  ),
  ...(data.value.excerptsAbout.total
    ? [publicExcerptsHeading(phrase.value.excerpts)]
    : []),
  ...(publicRelatedTotal(data.value.related)
    ? [publicRelatedHeading(phrase.value.related_entities)]
    : []),
  ...(data.value.notes?.blocks.length
    ? [publicOwnerNotesHeading(phrase.value.entity_notes)]
    : []),
]);
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader icon="thought" :title="heading" />
    <PublicReminderNotice :reminder="data.reminder" />
    <PublicDetailLayout
      :details="details"
      :content="data.content"
      :extra-contents="extraContents"
    >
      <ContentRenderer
        v-if="data.content.blocks.length"
        :data="data.content"
        asset-viewer
      />
      <div
        v-if="data.excerpts.length"
        data-landing-zone="excerpts"
        class="flex flex-col gap-lg"
        :class="{ 'mt-lg': data.content.blocks.length }"
      >
        <PublicExcerptInline
          v-for="excerpt in data.excerpts"
          :key="excerpt.publicId"
          :excerpt
        />
      </div>
      <PublicExcerptsBlock
        :about="data.excerptsAbout"
        :url="excerptsUrl"
        class="mt-lg"
      />
      <PublicRelatedBlock
        :counts="data.related"
        :url="relatedUrl"
        class="mt-lg"
      />
      <PublicOwnerNotes :notes="data.notes" class="mt-lg" />
    </PublicDetailLayout>
  </main>
</template>
