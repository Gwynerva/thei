import type { SiteFaviconInfo } from '#layers/thei/shared/profile';

/**
 * The three links an icon needs in the head: `favicon.ico` for the browsers
 * and readers that guess the address, an SVG or a PNG for the tab, and the
 * touch icon for a phone home screen.
 *
 * Given the site's icon, links the site's set, each address carrying the
 * icon's version so a replacement is fetched instead of served from cache.
 * Given nothing, links Thei's own set: the engine's pages wear Thei's icon,
 * not the site's.
 */
export function useFaviconLinks(
  favicon: MaybeRefOrGetter<SiteFaviconInfo | undefined>,
) {
  const site = useSiteUrl();
  useHead({
    link: computed(() => {
      const value = toValue(favicon);
      const paths = value
        ? {
            ico: `/favicon.ico?v=${value.version}`,
            icon: `/favicon/icon.${value.iconExtension}?v=${value.version}`,
            apple: `/apple-touch-icon.png?v=${value.version}`,
          }
        : {
            ico: '/favicon/thei/favicon.ico',
            icon: '/favicon/thei/icon.svg',
            apple: '/favicon/thei/apple-touch-icon.png',
          };
      const iconType =
        (value?.iconExtension ?? 'svg') === 'svg'
          ? 'image/svg+xml'
          : 'image/png';
      return [
        {
          key: 'site-favicon-ico',
          rel: 'icon',
          sizes: '32x32',
          href: site.path(paths.ico),
        },
        {
          key: 'site-favicon',
          rel: 'icon',
          type: iconType,
          href: site.path(paths.icon),
        },
        {
          key: 'site-apple-touch-icon',
          rel: 'apple-touch-icon',
          href: site.path(paths.apple),
        },
      ];
    }),
  });
}
