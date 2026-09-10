<script lang="ts" setup>
defineProps<{ page: number; pageCount: number }>();
defineEmits<{ page: [number] }>();
</script>

<template>
  <Pagination
    :page="page"
    :page-count="pageCount"
    class="pt-md"
    @page="$emit('page', $event)"
  />
</template>
