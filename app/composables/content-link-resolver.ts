import type {
  ContentLinkReference,
  ContentLinkResolver,
  ContentLinkApiResponse,
  ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import { contentLinkReferenceKey } from '#layers/thei/shared/content-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';

export type ContentLinkFetcher = (
  url: string,
  options: { query: Record<string, string> },
) => Promise<ContentLinkApiResponse>;

export type ContentLinkAudience = 'public' | 'admin';

/** A resolver whose remembered answers can be forgotten. */
export type CachingContentLinkResolver = ContentLinkResolver & {
  clear: () => void;
};

const appResolvers = new WeakMap<
  object,
  Map<ContentLinkAudience, CachingContentLinkResolver>
>();

/**
 * One resolver per app and audience, so a page asks about each target once.
 *
 * What it remembers holds for one page only. A target is found by its uuid,
 * but its title, address and even existence belong to the target: renamed,
 * moved to another address, made private or deleted in the meantime, it must
 * be asked about again, or a link keeps leading to where it no longer is.
 */
export function useContentLinkResolver(
  audience: ContentLinkAudience = 'public',
): ContentLinkResolver {
  const nuxtApp = useNuxtApp();
  let resolvers = appResolvers.get(nuxtApp);
  if (!resolvers) {
    const created = new Map<ContentLinkAudience, CachingContentLinkResolver>();
    resolvers = created;
    appResolvers.set(nuxtApp, created);
    if (import.meta.client)
      nuxtApp.hook('page:start', () => clearResolvers(created));
  }
  const cached = resolvers.get(audience);
  if (cached) return cached;
  const resolver = createContentLinkResolver(
    useRequestFetch() as ContentLinkFetcher,
    audience === 'admin' ? '/api/admin/content-links' : '/api/content-links',
  );
  resolvers.set(audience, resolver);
  return resolver;
}

/**
 * Announced on `document` when the resolved links were forgotten, so that the
 * chips already on the page ask about their targets again.
 */
export const CONTENT_LINKS_INVALIDATED_EVENT = 'thei:content-links-invalidated';

/**
 * Forgets every resolved link without leaving the page — for a view that may
 * follow an edit made on that same page, such as an editor opened again after
 * a save, or a link whose site was just read again.
 */
export function invalidateContentLinks() {
  const resolvers = appResolvers.get(useNuxtApp());
  if (resolvers) clearResolvers(resolvers);
  if (import.meta.client)
    document.dispatchEvent(new Event(CONTENT_LINKS_INVALIDATED_EVENT));
}

function clearResolvers(
  resolvers: Map<ContentLinkAudience, CachingContentLinkResolver>,
) {
  for (const resolver of resolvers.values()) resolver.clear();
}

export function createContentLinkResolver(
  fetcher: ContentLinkFetcher,
  endpoint = '/api/content-links',
): CachingContentLinkResolver {
  const resolved = new Map<string, ResolvedContentLink>();
  const pending = new Map<string, Promise<ResolvedContentLink>>();

  const resolve: ContentLinkResolver = async (reference) => {
    const key = contentLinkReferenceKey(reference);
    const cached = resolved.get(key);
    if (cached) return cached;

    let request = pending.get(key);
    if (!request) {
      request = resolveReference(fetcher, endpoint, reference).then(
        (result) => {
          pending.delete(key);
          if (result.state === 'resolved') resolved.set(key, result);
          return result;
        },
      );
      pending.set(key, request);
    }
    return await request;
  };
  return Object.assign(resolve, { clear: () => resolved.clear() });
}

async function resolveReference(
  fetcher: ContentLinkFetcher,
  endpoint: string,
  reference: ContentLinkReference,
): Promise<ResolvedContentLink> {
  let normalizedReference = reference;
  if (reference.kind === 'external') {
    try {
      normalizedReference = {
        kind: 'external',
        url: normalizeExternalLinkUrl(reference.url),
      };
    } catch {
      return { ...reference, state: 'broken', reason: 'invalid' };
    }
  }

  try {
    const response = await fetcher(endpoint, {
      query:
        normalizedReference.kind === 'entity'
          ? {
              kind: 'entity',
              entityType: normalizedReference.entityType,
              entityId: normalizedReference.entityId,
            }
          : { kind: 'external', url: normalizedReference.url },
    });
    return response.state === 'restricted'
      ? { ...normalizedReference, state: 'restricted' }
      : response;
  } catch {
    return {
      ...normalizedReference,
      state: 'broken',
      reason: 'unavailable',
      ...(normalizedReference.kind === 'external'
        ? { href: normalizedReference.url }
        : {}),
    };
  }
}
