import { iconsHref } from '#thei/icons';
import { inlineIconSprite } from '../composables/icon-sprite';
import { sitePath } from '../composables/site-url';

export default defineNuxtPlugin(() => {
  useHead({
    link: [
      {
        rel: 'prefetch',
        href: sitePath(iconsHref),
        type: 'image/svg+xml',
      },
    ],
  });

  // After hydration — all of it. `app:mounted` comes before the layout and
  // the page, which arrive as async chunks and hydrate later; flipping the
  // icon references then would make them disagree with the server's markup.
  // `onNuxtReady` waits for the whole tree, and then for an idle moment.
  if (import.meta.client) onNuxtReady(inlineIconSprite);
});
