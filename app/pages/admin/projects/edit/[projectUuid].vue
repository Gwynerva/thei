<script lang="ts" setup>
import AdminAddEditProject from '../components/AdminAddEditProject.vue';

definePageMeta({
  layout: 'admin',
});

const route = useRoute();
const projectUuid = route.params.projectUuid as string;
</script>

<template>
  <AdminAddEditProject :project-uuid="projectUuid" />
</template>
