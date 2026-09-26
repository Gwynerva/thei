import type { H3Event } from 'h3';
import {
  contentEntityReference,
  type ContentLinkApiResponse,
  type ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import {
  findExternalLink,
  refreshExternalLink,
  toResolvedExternalLink,
} from '../thei/external-links/repository';
import { resolveContentEntityLink } from '../thei/content-links/resolve';
import { resolvePublicViewer } from '../thei/access-links/viewer';

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
    if (reference)
      return await resolveContentEntityLink(
        await resolvePublicViewer(event),
        reference,
        Boolean(event.context.isAuthenticatedAdmin),
      );
    return {
      kind: 'external',
      url: typeof query.url === 'string' ? query.url : '',
      state: 'broken',
      reason: 'invalid',
    };
  },
);

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

  // A visitor only ever sees what is stored; an admin's editor may bring a
  // link the site has never seen, which is read once and kept.
  let link = await findExternalLink(url);
  if (!link && event.context.isAdmin) {
    link = await refreshExternalLink(url).catch(() => undefined);
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
  return toResolvedExternalLink(link);
}
