<script lang="ts" setup>
definePageMeta({
  layout: 'admin',
});

await useAdminTabTitle(phrase.value.new_project);
</script>

<template>
  <p>New Project</p>
</template>
