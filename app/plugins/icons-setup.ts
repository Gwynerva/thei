import { iconsHref } from '#thei/icons';

export default defineNuxtPlugin(() => {
  useHead({
    link: [
      {
        rel: 'prefetch',
        href: iconsHref,
        type: 'image/svg+xml',
      },
    ],
  });
});
