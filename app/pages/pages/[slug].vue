<script lang="ts" setup>
import { publicReferenceSplitSize } from '#layers/thei/shared/public-references';
import type { PublicPageResponse } from '#layers/thei/shared/api/page';
import type { PublicDetailPanelData } from '#layers/thei/app/components/public/public-detail';
import { buildPageUrl } from '#layers/thei/shared/page-url';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicPageResponse>(
  () => `/api/pages/${encodeURIComponent(String(route.params.slug))}`,
);
const data = useRequiredResource(resource);
const canonical = computed(() => buildPageUrl(data.value.slug));
if (route.path !== canonical.value)
  await navigateTo(canonical.value, { redirectCode: 301 });
const ogImage = useOgImage(
  'page',
  () => data.value.slug,
  () => [data.value.title, data.value.iconMedia.src],
);
usePublicSeo({
  ogImage,
  markdown: true,
  ogType: 'article',
  title: () => data.value.title,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.access === 'link-only',
  breadcrumbs: () => [{ name: phrase.value.pages, path: '/pages/' }],
  image: () => data.value.iconMedia.src,
  entities: () => [
    {
      '@type': 'Article',
      '@id': '#page',
      headline: data.value.title,
      description: data.value.summary,
      datePublished: data.value.chronology.createdAt,
      ...(data.value.chronology.updatedAt
        ? { dateModified: data.value.chronology.updatedAt }
        : {}),
      image: data.value.iconMedia.src,
    },
  ],
});

const linkCount = computed(() =>
  publicReferenceSplitSize(data.value.references.links),
);
const fileCount = computed(() =>
  publicReferenceSplitSize(data.value.references.files),
);
const details = computed(
  () =>
    ({
      chronology: [
        {
          icon: 'plus',
          label: phrase.value.page_chronology_created,
          date: data.value.chronology.createdAt,
        },
        ...(data.value.chronology.updatedAt
          ? [
              {
                icon: 'history' as const,
                label: phrase.value.page_chronology_updated,
                date: data.value.chronology.updatedAt,
              },
            ]
          : []),
      ],
      references: data.value.references,
      metrics: [
        {
          icon: 'link' as const,
          label: phrase.value.public_details_references,
          value: linkCount.value + fileCount.value,
        },
      ].filter((metric) => metric.value > 0),
    }) satisfies PublicDetailPanelData,
);
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="page"
      :icon-media="data.iconMedia"
      :title="data.title"
      :description="data.summary"
    />
    <PublicDetailLayout :details="details" :content="data.content">
      <ContentRenderer :data="data.content" asset-viewer />
    </PublicDetailLayout>
  </main>
</template>
