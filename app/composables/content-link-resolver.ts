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

const appResolvers = new WeakMap<
  object,
  Map<ContentLinkAudience, ContentLinkResolver>
>();

export function useContentLinkResolver(
  audience: ContentLinkAudience = 'public',
): ContentLinkResolver {
  const nuxtApp = useNuxtApp();
  let resolvers = appResolvers.get(nuxtApp);
  if (!resolvers) {
    resolvers = new Map();
    appResolvers.set(nuxtApp, resolvers);
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

export function createContentLinkResolver(
  fetcher: ContentLinkFetcher,
  endpoint = '/api/content-links',
): ContentLinkResolver {
  const resolved = new Map<string, ResolvedContentLink>();
  const pending = new Map<string, Promise<ResolvedContentLink>>();

  return async (reference) => {
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
        normalizedReference.kind === 'project'
          ? {
              kind: 'project',
              projectUuid: normalizedReference.projectUuid,
            }
          : normalizedReference.kind === 'event'
            ? { kind: 'event', eventUuid: normalizedReference.eventUuid }
            : normalizedReference.kind === 'page'
              ? { kind: 'page', pageUuid: normalizedReference.pageUuid }
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
