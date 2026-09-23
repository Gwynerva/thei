<script lang="ts" setup>
import type { PublicDiaryResponse } from '#layers/thei/shared/api/public';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildLifeUrl } from '#layers/thei/shared/life';
import type { PublicDetailPanelData } from '#layers/thei/app/components/public/public-detail';
import { publicOwnerNotesHeading } from '#layers/thei/app/components/public/PublicOwnerNotes.vue';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicDiaryResponse>(
  () => `/api/diary/${encodeURIComponent(String(route.params.date))}`,
);
const data = useRequiredResource(resource);
const canonical = computed(() => buildDiaryUrl(data.value.date));
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
      createdAt: data.value.date,
      relatedEntities: data.value.relatedEntities,
      references: data.value.references,
    }) satisfies PublicDetailPanelData,
);

/** The owner's notes sit below the entry and belong in its table. */
const extraContents = computed(() =>
  data.value.notes?.blocks.length
    ? [publicOwnerNotesHeading(phrase.value.entity_notes)]
    : [],
);
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
      <PublicOwnerNotes :notes="data.notes" />
    </PublicDetailLayout>
  </main>
</template>
