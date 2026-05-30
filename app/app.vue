<script lang="ts" setup>
useHead({
  link: [
    {
      rel: 'icon',
      href: '/favicon.svg',
      type: 'image/svg+xml',
    },
  ],
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage></NuxtPage>
  </NuxtLayout>
  <TitlePopup />
  <Modal />
</template>
