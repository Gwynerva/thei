import type {
  ContentEntityReference,
  ContentLinkApiResponse,
} from '#layers/thei/shared/content-link';
import { findContentEntity } from '../content-entities';
import { opensGrantOwner, type PublicViewer } from '../access-links/viewer';
import { canResolveContentEntityLink } from './access';

/**
 * What a link to an entity shows this reader.
 *
 * A reader who may not open the entity is told the same thing whether it is
 * private or was never there. Public content no longer carries the uuid of
 * such an entity at all, so only an admin previewing their own site as a guest
 * has a legitimate reason to see the two told apart.
 *
 * A share link opens its own entity's links — a project's link, its private
 * sections — and none of the others.
 */
export async function resolveContentEntityLink(
  viewer: PublicViewer,
  reference: ContentEntityReference,
  isAuthenticatedAdmin: boolean,
): Promise<ContentLinkApiResponse> {
  const entity = await findContentEntity(reference, viewer);
  if (!entity) return { ...reference, state: 'broken', reason: 'not-found' };
  const opens = opensGrantOwner(viewer, entity.grantOwner);
  if (!canResolveContentEntityLink(entity.access, opens))
    return isAuthenticatedAdmin
      ? { state: 'restricted' }
      : { ...reference, state: 'broken', reason: 'not-found' };
  const media = await entity.media(viewer.isAdmin ? 'admin' : 'public', opens);
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
