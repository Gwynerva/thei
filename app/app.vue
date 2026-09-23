<script lang="ts" setup>
provideStickyHeaderContext();

// Thei's own icon, for the engine's pages: the admin, the installer, the
// update screen and sign-in. The public layout puts the site's icon over it.
useFaviconLinks(() => undefined);
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage></NuxtPage>
  </NuxtLayout>
  <TitlePopup />
  <Modal />
</template>
