import { iconsHref } from '#thei/icons';
import { inlineIconSprite } from '../composables/icon-sprite';
import { sitePath } from '../composables/site-url';

export default defineNuxtPlugin((nuxtApp) => {
  useHead({
    link: [
      {
        rel: 'prefetch',
        href: sitePath(iconsHref),
        type: 'image/svg+xml',
      },
    ],
  });

  // After hydration: the first render must match the server's markup.
  if (import.meta.client) nuxtApp.hook('app:mounted', inlineIconSprite);
});
