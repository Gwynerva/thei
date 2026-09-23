import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import {
  parseInternalUrl,
  type InternalUrlSite,
} from '#layers/thei/shared/internal-url';

/**
 * What counts as this site when the editor checks whether an address is one
 * of its own: the configured address and the one the admin is working on,
 * which differ when the site is reached through a second hostname.
 */
export function useInternalUrlSite(): InternalUrlSite {
  const site = useSiteUrl();
  return {
    origins: [
      site.origin.value,
      ...(import.meta.client ? [window.location.origin] : []),
    ],
    base: site.base,
  };
}

/**
 * The entity an address of this site opens, or nothing.
 *
 * The shape is checked here first, so an address of another site never costs
 * a request; only the server can tell whether the entity actually exists.
 */
export async function findEntityByInternalUrl(
  url: string,
  site: InternalUrlSite,
): Promise<ContentEntitySearchItem | undefined> {
  if (!parseInternalUrl(url, site)) return undefined;
  const { entity } = await $fetch<{ entity: ContentEntitySearchItem | null }>(
    '/api/admin/content-entities/by-url',
    { query: { url } },
  );
  return entity ?? undefined;
}
