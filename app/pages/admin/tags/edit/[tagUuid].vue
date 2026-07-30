<script lang="ts" setup>
import AdminAddEditTag from '../components/AdminAddEditTag.vue';
definePageMeta({ layout: 'admin' });
const tagUuid = useRoute().params.tagUuid as string;
</script>
<template><AdminAddEditTag :tag-uuid="tagUuid" /></template>
