<script lang="ts" setup>
const publicAdmin = await usePublicAdmin();
const requestUrl = useRequestURL();
const siteName = publicAdmin.value.displayName;

useHead({
  htmlAttrs: { lang: publicAdmin.value.languageCode },
  titleTemplate: (title) =>
    !title || title === siteName ? siteName : `${title} — ${siteName}`,
  script: [
    {
      key: 'public-website-jsonld',
      type: 'application/ld+json',
      textContent: serializeJsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${new URL('/', requestUrl.origin).toString()}#website`,
        name: siteName,
        url: new URL('/', requestUrl.origin).toString(),
        inLanguage: publicAdmin.value.languageCode,
      }),
    },
  ],
});
</script>

<template>
  <div>
    <AdminBar />
    <PublicHeader />
    <TheiLoadingIndicator />
    <slot></slot>
  </div>
</template>
