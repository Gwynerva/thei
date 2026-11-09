<script lang="ts" setup>
import type { PublicExcerptResponse } from '#layers/thei/shared/api/public';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicExcerptResponse>(
  () =>
    `/api/projects/${encodeURIComponent(String(route.params.projectUuid))}/excerpts/${encodeURIComponent(String(route.params.excerpt))}`,
);
const data = useRequiredResource(resource);
// The address is the excerpt's own, under its parent's.
if (route.path !== data.value.href)
  await navigateTo(data.value.href, { redirectCode: 301 });
</script>

<template>
  <PublicExcerptPage :data="data" />
</template>
