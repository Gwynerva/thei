<script lang="ts" setup>
import AdminAddEditDiaryEntry from '../components/AdminAddEditDiaryEntry.vue';
definePageMeta({ layout: 'admin' });
const diaryUuid = useRoute().params.diaryUuid as string;
</script>

<template><AdminAddEditDiaryEntry :diary-uuid="diaryUuid" /></template>
