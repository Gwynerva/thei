<script lang="ts" setup>
import AdminAddEditEvent from '../components/AdminAddEditEvent.vue';
definePageMeta({ layout: 'admin' });
const eventUuid = useRoute().params.eventUuid as string;
</script>

<template><AdminAddEditEvent :event-uuid="eventUuid" /></template>
