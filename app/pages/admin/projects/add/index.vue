<script lang="ts" setup>
definePageMeta({
  layout: 'admin',
});

const { new_project } = useLanguagePhrases();

await useAdminTabTitle(new_project);
</script>

<template>
  <AdminHeading :level="1" :title="new_project" />
</template>
