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
  <Pagination :page="page" :page-count="pageCount" :page-to="pageTo" />
</template>
