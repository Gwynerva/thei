import type { H3Event } from 'h3';
import {
  contentEntityReference,
  type ContentEntityReference,
  type ContentLinkApiResponse,
  type ContentLinkReference,
  type ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import { findExternalLink } from '../thei/external-links/repository';
import { persistExternalLink } from '../thei/external-links/preview';
import { canResolveContentEntityLink } from '../thei/content-links/access';
import { findContentEntity } from '../thei/content-entities';

/**
 * A reader who may not open an entity is told the same thing whether it is
 * private or was never there. Public content no longer carries the uuid of
 * such an entity at all, so only an admin previewing their own site as a guest
 * has a legitimate reason to see the two told apart.
 */
function restrictedState(
  event: H3Event,
  reference: ContentLinkReference,
): ContentLinkApiResponse {
  return event.context.isAuthenticatedAdmin
    ? { state: 'restricted' }
    : { ...reference, state: 'broken', reason: 'not-found' };
}

export default defineEventHandler(
  async (event): Promise<ContentLinkApiResponse> => {
    const query = getQuery(event);
    if (query.kind === 'external') {
      return await resolveExternalLink(event, query.url);
    }
    const reference =
      query.kind === 'entity'
        ? contentEntityReference(query.entityType, query.entityId)
        : undefined;
    if (reference) return await resolveEntityLink(event, reference);
    return {
      kind: 'external',
      url: typeof query.url === 'string' ? query.url : '',
      state: 'broken',
      reason: 'invalid',
    };
  },
);

async function resolveEntityLink(
  event: H3Event,
  reference: ContentEntityReference,
): Promise<ContentLinkApiResponse> {
  const isAdmin = Boolean(event.context.isAdmin);
  const entity = await findContentEntity(reference, isAdmin);
  if (!entity) return { ...reference, state: 'broken', reason: 'not-found' };
  if (!canResolveContentEntityLink(entity.access, isAdmin))
    return restrictedState(event, reference);
  const media = await entity.media(isAdmin ? 'admin' : 'public');
  return {
    ...reference,
    state: 'resolved',
    href: entity.href,
    title: entity.title,
    summary: entity.summary,
    ...(media ? { media } : {}),
    ...(entity.date ? { date: entity.date } : {}),
    ...(entity.parent ? { parent: entity.parent } : {}),
  };
}

async function resolveExternalLink(
  event: H3Event,
  value: unknown,
): Promise<ResolvedContentLink> {
  let url: string;
  try {
    url = normalizeExternalLinkUrl(value);
  } catch {
    return {
      kind: 'external',
      url: typeof value === 'string' ? value : '',
      state: 'broken',
      reason: 'invalid',
    };
  }

  let link = await findExternalLink(url);
  if (!link && event.context.isAdmin) {
    link = await persistExternalLink(url).catch(() => undefined);
  }
  if (!link) {
    return {
      kind: 'external',
      url,
      href: url,
      state: 'broken',
      reason: 'unavailable',
    };
  }
  return {
    kind: 'external',
    url,
    state: 'resolved',
    href: url,
    title: link.title,
    description: link.description,
    iconMedia: link.faviconMedia,
  };
}
