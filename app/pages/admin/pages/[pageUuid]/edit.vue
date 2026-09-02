<script lang="ts" setup>
import AdminAddEditPage from '../components/AdminAddEditPage.vue';
definePageMeta({ layout: 'admin', key: (route) => route.path });
const route = useRoute();
const pageUuid = computed(() => String(route.params.pageUuid));
</script>

<template><AdminAddEditPage :page-uuid="pageUuid" /></template>
