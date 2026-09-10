<script lang="ts" setup>
const publicAdmin = await usePublicAdmin();
const requestUrl = useRequestURL();
const siteName = computed(() => publicAdmin.value.displayName);

useHead({
  htmlAttrs: { lang: computed(() => publicAdmin.value.languageCode) },
  link: computed(() => [
    {
      key: 'site-favicon',
      rel: 'icon',
      href: publicAdmin.value.faviconMedia?.src ?? '/favicon.svg',
    },
  ]),
  titleTemplate: (title) =>
    !title || title === siteName.value
      ? siteName.value
      : `${title} — ${siteName.value}`,
  script: [
    {
      key: 'public-website-jsonld',
      type: 'application/ld+json',
      textContent: serializeJsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${new URL('/', requestUrl.origin).toString()}#website`,
        name: siteName.value,
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
