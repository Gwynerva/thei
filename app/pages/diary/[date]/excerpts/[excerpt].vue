<script lang="ts" setup>
import type { PublicExcerptResponse } from '#layers/thei/shared/api/public';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicExcerptResponse>(
  () =>
    `/api/diary/${encodeURIComponent(String(route.params.date))}/excerpts/${encodeURIComponent(String(route.params.excerpt))}`,
);
const data = useRequiredResource(resource);
// The address is the excerpt's own, under its parent's; the place a link
// named in it goes along.
if (route.path !== data.value.href)
  await navigateTo(data.value.href + route.hash, { redirectCode: 301 });
</script>

<template>
  <PublicExcerptPage :data="data" />
</template>
