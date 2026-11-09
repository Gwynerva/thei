<script lang="ts" setup>
import type { PublicDiaryResponse } from '#layers/thei/shared/api/public';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { diaryDescription } from '#layers/thei/shared/diary-text';
import { buildLifeUrl } from '#layers/thei/shared/life';
import {
  createdAndUpdatedTimelineItems,
  type PublicDetailPanelData,
} from '#layers/thei/app/components/public/public-detail';
import { publicBelowTextContents } from '#layers/thei/app/components/public/public-page-contents';
import { publicExcerptParts } from '#layers/thei/app/components/public/PublicExcerptInline.vue';
import { DIARY_TEXT_ANCHOR } from '#layers/thei/shared/content-headings';

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

/**
 * What a search engine shows under the day: its excerpts by what each is
 * about, then its first words as far as the room goes — or its lead, for an
 * entry without excerpts; for a day with no text this reader may see, only
 * that it is a diary entry. The text arrived cut to this reader already, its
 * private parts opened or stood in for, so it is taken whole.
 */
const description = computed(
  () =>
    diaryDescription({
      data: data.value.content,
      excerpts: data.value.excerpts.map((excerpt) => {
        const about = excerpt.about[0];
        return {
          title: excerpt.title,
          ...(about ? { subject: publicExcerptSubjectName(about) } : {}),
        };
      }),
      includePrivate: true,
      privateLabel: phrase.value.content_private_section,
    }) || phrase.value.diary_entry_seo_description(heading.value),
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
  description,
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
      excerptSecrets: data.value.excerptSecrets,
      // The day the entry is about is its heading, not a technical date.
      chronology: createdAndUpdatedTimelineItems(data.value.chronology, {
        created: phrase.value.diary_chronology_created,
        updated: phrase.value.diary_chronology_updated,
      }),
    }) satisfies PublicDetailPanelData,
);

const extraContents = computed(() => publicBelowTextContents(data.value));
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader icon="thought" :title="heading" />
    <PublicReminderNotice :reminder="data.reminder" />
    <PublicDetailLayout
      :details="details"
      :content="data.content"
      :extra-contents="extraContents"
      :content-start="{
        id: DIARY_TEXT_ANCHOR,
        title: phrase.public_diary_text,
      }"
    >
      <ContentRenderer
        v-if="data.content.blocks.length"
        :id="DIARY_TEXT_ANCHOR"
        :data="data.content"
        asset-viewer
        class="scroll-mt-[var(--public-anchor-offset,8rem)]"
      />
      <PublicPageExcerpts
        :excerpts="data.excerpts"
        :secrets="data.excerptSecrets"
        :class="{ 'mt-lg': data.content.blocks.length }"
      />
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
