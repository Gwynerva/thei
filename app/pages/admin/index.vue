<script lang="ts" setup>
definePageMeta({
  layout: 'admin',
});

await useAdminTabTitle(computed(() => phrase.value.admin_panel));
</script>

<template>
  <div class="m-auto w-(--width-wide) px-window py-lg">
    <AdminSessions />
  </div>
</template>
