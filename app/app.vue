<script lang="ts" setup>
import { iconsHref } from '#thei/icons';

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
</template>
