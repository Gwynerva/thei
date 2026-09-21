import type { H3Event } from 'h3';
import type { ShareLinkEntityType } from '#layers/thei/shared/share-link';
import { readShareGrants } from './share-links';

/**
 * Who may see the private side of one entity.
 *
 * Everywhere else in the engine a request is simply "admin" or "not admin",
 * and that single flag decides what every builder hides. A share link cannot
 * flip it: the guest holding the link may see one project in full and nothing
 * else. So the flag is computed per entity instead — the shared project is
 * built as the owner sees it, while related projects, lists and the timeline
 * are built for the stranger the visitor still is.
 */
export function shareGrants(event: H3Event): Map<string, number> {
  const cached = event.context.shareGrants as Map<string, number> | undefined;
  if (cached) return cached;
  const grants = readShareGrants(event);
  event.context.shareGrants = grants;
  return grants;
}

export function hasShareGrant(
  event: H3Event,
  entityType: ShareLinkEntityType,
  entityUuid: string,
): boolean {
  return shareGrants(event).has(`${entityType}:${entityUuid}`);
}

/** `true` when the viewer is the owner, or holds a share link for this entity. */
export async function canViewPrivate(
  event: H3Event,
  entityType: ShareLinkEntityType,
  entityUuid: string,
): Promise<boolean> {
  if (await THEI_SERVER.isAdmin(event)) return true;
  return hasShareGrant(event, entityType, entityUuid);
}

export interface EntityViewer {
  /** The site-wide role: what every other entity is built with. */
  isAdmin: boolean;
  /** The role for this entity: private parts included. */
  asOwner: boolean;
  /** True when the private view comes from a share link, not a session. */
  viaShare: boolean;
}

export async function resolveEntityViewer(
  event: H3Event,
  entityType: ShareLinkEntityType,
  entityUuid: string,
): Promise<EntityViewer> {
  const isAdmin = await THEI_SERVER.isAdmin(event);
  const viaShare = !isAdmin && hasShareGrant(event, entityType, entityUuid);
  return { isAdmin, asOwner: isAdmin || viaShare, viaShare };
}
