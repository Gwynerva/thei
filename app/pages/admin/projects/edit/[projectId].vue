<script lang="ts" setup>
import AdminAddEditProject from '../components/AdminAddEditProject.vue';

definePageMeta({
  layout: 'admin',
});

const route = useRoute();
const projectId = route.params.projectId as string | undefined;

if (!projectId) {
  throw createError({ statusCode: 400, message: 'Project ID is required!' });
}
</script>

<template>
  <AdminAddEditProject :project-id="projectId" />
</template>
