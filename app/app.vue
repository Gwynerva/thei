<script lang="ts" setup>
provideStickyHeaderContext();

const isAdmin = useIsAdmin();

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
  <!-- Its dialog opens above whatever modal is already open. -->
  <UpdateOverlay v-if="isAdmin" />
</template>
