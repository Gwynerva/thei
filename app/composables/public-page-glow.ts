import type { MaybeRefOrGetter } from 'vue';

/**
 * Configures the soft accent glow the public layout draws at the page top.
 *
 * It goes through `<body>` attributes rather than shared state: the layout
 * renders before the page on the server, while head attributes are resolved
 * after the whole app, so SSR and hydration always agree. The entry is dropped
 * with the page, which returns the next page to the theme accent.
 */
export function usePublicPageGlow(options: {
  color?: MaybeRefOrGetter<string | undefined>;
  enabled?: boolean;
}) {
  useHead(() => {
    const color = toValue(options.color);
    return {
      bodyAttrs: {
        ...(options.enabled === false ? { 'data-public-glow': 'off' } : {}),
        ...(color ? { style: `--public-page-glow: ${color}` } : {}),
      },
    };
  });
}
