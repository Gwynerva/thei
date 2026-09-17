<script lang="ts" setup>
const publicAdmin = await usePublicAdmin();
const site = useSiteUrl();
const siteName = computed(() => publicAdmin.value.displayName);
const isAdmin = useIsAdmin();
const stickyHeader = useStickyHeaderContext();
// Anchors land below the sticky bars; the header row is the SSR fallback.
const rootStyle = computed(() => ({
  '--public-anchor-offset': `calc(${isAdmin.value ? 'var(--height-admin-bar)' : '0px'} + max(${stickyHeader?.height.value ?? 0}px, calc(var(--spacing) * 14)) + var(--spacing-sm))`,
}));

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
        '@id': `${site.resolve('/')}#website`,
        name: siteName.value,
        url: site.resolve('/'),
        inLanguage: publicAdmin.value.languageCode,
      }),
    },
  ],
});
</script>

<template>
  <div class="relative isolate" :style="rootStyle">
    <div
      class="public-page-glow pointer-events-none absolute inset-x-0 top-0 -z-1
        h-112"
      aria-hidden="true"
    ></div>
    <AdminBar />
    <PublicHeader />
    <TheiLoadingIndicator />
    <slot></slot>
  </div>
</template>

<style scoped>
@reference "../styles/main.css";
.public-page-glow {
  background: radial-gradient(
    ellipse 90% 100% at 50% 0%,
    color-mix(
      in oklab,
      var(--public-page-glow, var(--color-accent)) 22%,
      transparent
    ),
    color-mix(
        in oklab,
        var(--public-page-glow, var(--color-accent)) 8%,
        transparent
      )
      45%,
    transparent 75%
  );
}

body[data-public-glow='off'] .public-page-glow {
  display: none;
}

@variant sm {
  .public-page-glow {
    background: radial-gradient(
      ellipse 55% 100% at 50% 0%,
      color-mix(
        in oklab,
        var(--public-page-glow, var(--color-accent)) 18%,
        transparent
      ),
      color-mix(
          in oklab,
          var(--public-page-glow, var(--color-accent)) 6%,
          transparent
        )
        45%,
      transparent 75%
    );
  }
}
</style>
