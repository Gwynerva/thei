import { iconsHref } from '#thei/icons';
import { inlineIconSprite } from '../composables/icon-sprite';

export default defineNuxtPlugin((nuxtApp) => {
  useHead({
    link: [
      {
        rel: 'prefetch',
        href: iconsHref,
        type: 'image/svg+xml',
      },
    ],
  });

  // After hydration: the first render must match the server's markup.
  if (import.meta.client) nuxtApp.hook('app:mounted', inlineIconSprite);
});
