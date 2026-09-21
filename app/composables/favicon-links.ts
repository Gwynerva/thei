import type { SiteFaviconInfo } from '#layers/thei/shared/profile';

/**
 * The three links a site icon needs in the head.
 *
 * `favicon.ico` for the browsers and readers that guess the address, an SVG or
 * a PNG for the tab, and the touch icon for a phone home screen. Each carries
 * the version of the current icon, so replacing the icon replaces what is
 * cached instead of living beside it.
 */
export function useFaviconLinks(
  favicon: MaybeRefOrGetter<SiteFaviconInfo | undefined>,
) {
  const site = useSiteUrl();
  useHead({
    link: computed(() => {
      const value = toValue(favicon);
      const version = value?.version ? `?v=${value.version}` : '';
      const iconExtension = value?.iconExtension ?? 'svg';
      return [
        {
          key: 'site-favicon-ico',
          rel: 'icon',
          sizes: '32x32',
          href: site.path(`/favicon.ico${version}`),
        },
        {
          key: 'site-favicon',
          rel: 'icon',
          type: iconExtension === 'svg' ? 'image/svg+xml' : 'image/png',
          href: site.path(`/favicon/icon.${iconExtension}${version}`),
        },
        {
          key: 'site-apple-touch-icon',
          rel: 'apple-touch-icon',
          href: site.path(`/apple-touch-icon.png${version}`),
        },
      ];
    }),
  });
}
