<script lang="ts" setup>
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
usePublicSeo({
  title: () => data.value.title,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.access === 'link-only',
});

const linkCount = computed(
  () =>
    data.value.references.manual.links.length +
    data.value.references.content.links.length,
);
const fileCount = computed(
  () =>
    data.value.references.manual.files.length +
    data.value.references.content.files.length,
);
const details = computed(
  () =>
    ({
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
