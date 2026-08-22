<script lang="ts" setup>
import type { PublicEventResponse } from '#layers/thei/shared/api/event';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import DateRangeChip from '#layers/thei/app/components/DateRangeChip.vue';

definePageMeta({ layout: 'public' });
const route = useRoute();
const data = await useRequestFetch()<PublicEventResponse>(
  `/api/events/${encodeURIComponent(String(route.params.event))}`,
);
const canonical = buildEventUrl(data.humanReadableSlug, data.publicId);
if (route.path !== canonical)
  await navigateTo(canonical, { redirectCode: 301 });
useHead({
  title: data.title,
  meta:
    data.access === 'link-only'
      ? [{ name: 'robots', content: 'noindex,nofollow' }]
      : [],
});
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <header class="flex flex-col gap-xs">
      <div class="flex items-center gap-xs text-text-2">
        <Icon name="event" />
        <span>{{ phrase.event }}</span>
      </div>
      <h1 class="text-3xl font-bold tracking-tight">{{ data.title }}</h1>
      <p class="max-w-192 text-lg text-text-2">{{ data.summary }}</p>
    </header>
    <Box class="flex flex-wrap gap-xs p-sm sm:p-md">
      <DateRangeChip
        v-for="period in data.periods"
        :key="`${period.startDate}:${period.endDate}`"
        :period="period"
      />
    </Box>
  </main>
</template>
