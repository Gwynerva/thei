export default defineNuxtPlugin((nuxtApp) => {
  // Once the whole tree has hydrated: `app:mounted` comes before the layout
  // and the page, which arrive as async chunks and hydrate later.
  nuxtApp.hook('app:suspense:resolve', () => {
    document.documentElement.dataset.nuxtHydrated = 'true';
  });
});
