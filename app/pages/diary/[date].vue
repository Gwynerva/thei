<script lang="ts" setup>
import type { PublicDiaryResponse } from '#layers/thei/shared/api/public';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildLifeUrl } from '#layers/thei/shared/life';
import {
  diaryTimelineItems,
  type PublicDetailPanelData,
} from '#layers/thei/app/components/public/public-detail';
import { publicOwnerNotesHeading } from '#layers/thei/app/components/public/PublicOwnerNotes.vue';
import {
  publicRelatedHeading,
  publicRelatedTotal,
} from '#layers/thei/app/components/public/PublicRelatedBlock.vue';

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

const ogImage = useOgImage(
  'diary',
  () => data.value.date,
  () => [heading.value],
);
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
  entities: () => [
    {
      '@type': 'BlogPosting',
      '@id': '#diary-entry',
      headline: heading.value,
      datePublished: data.value.date,
    },
  ],
});

const details = computed(
  () =>
    ({
      chronology: diaryTimelineItems(
        { ...data.value, href: buildLifeUrl({ date: data.value.date }) },
        {
          day: phrase.value.diary_chronology_day,
          created: phrase.value.diary_chronology_created,
          updated: phrase.value.diary_chronology_updated,
        },
      ),
      references: data.value.references,
    }) satisfies PublicDetailPanelData,
);

/**
 * The sections below the entry that belong in its table: what it is related
 * to, then the owner's notes, which nobody else gets at all.
 */
const extraContents = computed(() => [
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
    <PublicShareNotice />
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
      <PublicRelatedBlock
        :counts="data.related"
        :url="relatedUrl"
        class="mt-lg"
      />
      <PublicOwnerNotes :notes="data.notes" />
    </PublicDetailLayout>
  </main>
</template>
