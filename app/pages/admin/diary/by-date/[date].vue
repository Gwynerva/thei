<script lang="ts" setup>
/**
 * The bridge from a day to the entry written on it.
 *
 * The public page of an entry is addressed by its date, and the editor by the
 * entry's id, so the "edit this" button in the admin bar has nowhere to point
 * without a lookup. This page is that lookup and nothing else.
 */
definePageMeta({ layout: 'admin' });
const date = useRoute().params.date as string;
const entries = await useRequestFetch()<
  Array<{ date: string; diaryUuid: string }>
>('/api/admin/diary/dates');
const entry = entries.find((item) => item.date === date);
await navigateTo(
  entry ? `/admin/diary/${entry.diaryUuid}/edit/` : '/admin/diary/new/',
  { replace: true },
);
</script>

<template><div /></template>
