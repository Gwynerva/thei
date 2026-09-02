<script lang="ts" setup>
const props = defineProps<{
  page: number;
  pageCount: number;
  queryKey?: string;
}>();

const route = useRoute();
const key = computed(() => props.queryKey ?? 'page');

function pageTo(page: number) {
  const query = { ...route.query };
  if (page <= 1) delete query[key.value];
  else query[key.value] = String(page);
  return { path: route.path, query };
}
</script>

<template>
  <nav
    v-if="pageCount > 1"
    class="flex items-center justify-center gap-xs"
    :aria-label="phrase.pagination"
  >
    <TheiLink
      :to="page <= 1 ? undefined : pageTo(page - 1)"
      :aria-label="phrase.previous"
      class="flex size-9 items-center justify-center rounded-normal bg-bg-3
        text-text-2 transition hocus:bg-accent/20 hocus:text-accent"
      :class="{ 'pointer-events-none opacity-40': page <= 1 }"
      ><Icon name="chevron-left"
    /></TheiLink>
    <span class="min-w-20 text-center text-sm font-semibold text-text-2">
      {{ page }} / {{ pageCount }}
    </span>
    <TheiLink
      :to="page >= pageCount ? undefined : pageTo(page + 1)"
      :aria-label="phrase.next"
      class="flex size-9 items-center justify-center rounded-normal bg-bg-3
        text-text-2 transition hocus:bg-accent/20 hocus:text-accent"
      :class="{ 'pointer-events-none opacity-40': page >= pageCount }"
      ><Icon name="chevron-right"
    /></TheiLink>
  </nav>
</template>
