<script lang="ts" setup>
provideStickyHeaderContext();

// The default set, so a page rendered before the profile is known — the
// installer, the update screen, an error page — still has an icon.
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
