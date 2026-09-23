import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import { parseInternalUrl } from '#layers/thei/shared/internal-url';
import { findContentEntityByTarget } from '../../../thei/content-entities';
import { contentEntitySearchItem } from '../../../thei/content-entity-search';
import { internalUrlSite } from '../../../thei/site-url';

/**
 * The entity an address of this site opens, or `null` in its place.
 *
 * The editor asks this when an address is pasted or typed as an external link:
 * a link to the site's own page is stored as a link to the entity instead, so
 * it survives the site moving to another domain.
 */
export default defineEventHandler(
  async (event): Promise<{ entity: ContentEntitySearchItem | null }> => {
    const url = getQuery(event).url;
    if (typeof url !== 'string') return { entity: null };
    const target = parseInternalUrl(url, internalUrlSite(event));
    const record = target && (await findContentEntityByTarget(target, true));
    return { entity: record ? await contentEntitySearchItem(record) : null };
  },
);
