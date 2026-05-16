<script lang="ts" setup>
definePageMeta({
  layout: 'admin',
});

await useAdminTabTitle(phrase.value.new_project);
</script>

<template>
  <AdminHeading :level="1" :title="phrase.new_project" />
</template>
