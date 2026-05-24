<script lang="ts" setup>
definePageMeta({
  layout: 'public',
});

const route = useRoute();
const projectUuid = route.params.projectUuid as string;
</script>

<template>
  <div>{{ projectUuid }}</div>
</template>
