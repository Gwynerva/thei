import type { H3Event } from 'h3';
import {
  shareGrantKey,
  type ShareGrantOwner,
  type ShareLinkEntityType,
} from '#layers/thei/shared/share-link';
import { readShareGrants } from './share-links';

/**
 * Who is reading, as far as private things go.
 *
 * Everywhere else in the engine a request is simply "admin" or "not admin".
 * A share link cannot flip that flag: the guest holding it may see one project
 * in full and nothing else. So a builder is handed the whole viewer and asks
 * it about each entity it touches — its own entity is built with the private
 * side the grant opens, while everything it merely mentions is judged for the
 * stranger the visitor still is.
 *
 * Three questions, three answers:
 * - the private parts of the entity being built — `opensPrivate`;
 * - another entity it links to or lists — `opensGrantOwner` on that entity;
 * - what only the owner ever sees (reminders, notes, admin addresses, lists
 *   and search) — `isAdmin`, which no share link changes.
 */
export interface PublicViewer {
  /** The site-wide role. */
  readonly isAdmin: boolean;
  /** `type:uuid` of each entity whose private side a share link opens. */
  readonly grants: ReadonlySet<string>;
}

const NO_GRANTS: ReadonlySet<string> = new Set();

/** A visitor with no role and no links: what every public representation is built for. */
export const STRANGER: PublicViewer = Object.freeze({
  isAdmin: false,
  grants: NO_GRANTS,
});

/** The owner, who needs no links. */
export const OWNER: PublicViewer = Object.freeze({
  isAdmin: true,
  grants: NO_GRANTS,
});

/**
 * The viewer for pages that span the whole site — lists, search, the profile,
 * the global timeline. A share link never widens those.
 */
export function siteViewer(isAdmin: boolean): PublicViewer {
  return isAdmin ? OWNER : STRANGER;
}

/** Whether the private side of this entity is open to the viewer. */
export function opensPrivate(
  viewer: PublicViewer,
  entityType: ShareLinkEntityType,
  entityId: string,
): boolean {
  return (
    viewer.isAdmin || viewer.grants.has(shareGrantKey(entityType, entityId))
  );
}

/**
 * The same question about a section or anything else that is shared
 * through an owner of its own. Nothing without an owner — a tag — is private.
 */
export function opensGrantOwner(
  viewer: PublicViewer,
  owner: ShareGrantOwner | undefined,
): boolean {
  return (
    viewer.isAdmin ||
    (owner !== undefined &&
      opensPrivate(viewer, owner.entityType, owner.entityId))
  );
}

/**
 * The viewer narrowed to one grant. A project's chronology gathers events and
 * diary entries of its own; a link to the project opens the project's points,
 * not theirs, even when the visitor happens to hold links to them too.
 */
export function scopedViewer(
  viewer: PublicViewer,
  entityType: ShareLinkEntityType,
  entityId: string,
): PublicViewer {
  if (viewer.isAdmin) return OWNER;
  const key = shareGrantKey(entityType, entityId);
  return viewer.grants.has(key)
    ? { isAdmin: false, grants: new Set([key]) }
    : STRANGER;
}

/** The grants a request carries, read once and kept for the rest of it. */
export function shareGrants(event: H3Event): Map<string, number> {
  const cached = event.context.shareGrants as Map<string, number> | undefined;
  if (cached) return cached;
  const grants = readShareGrants(event);
  event.context.shareGrants = grants;
  return grants;
}

export async function resolvePublicViewer(
  event: H3Event,
): Promise<PublicViewer> {
  const cached = event.context.publicViewer as PublicViewer | undefined;
  if (cached) return cached;
  const isAdmin = await THEI_SERVER.isAdmin(event);
  const viewer: PublicViewer = isAdmin
    ? OWNER
    : { isAdmin: false, grants: new Set(shareGrants(event).keys()) };
  event.context.publicViewer = viewer;
  return viewer;
}

export interface EntityViewer extends PublicViewer {
  /** The private side of this entity: the owner's, or a share link's. */
  asOwner: boolean;
  /** True when the private view comes from a share link, not a session. */
  viaShare: boolean;
}

export async function resolveEntityViewer(
  event: H3Event,
  entityType: ShareLinkEntityType,
  entityUuid: string,
): Promise<EntityViewer> {
  const viewer = await resolvePublicViewer(event);
  const asOwner = opensPrivate(viewer, entityType, entityUuid);
  return { ...viewer, asOwner, viaShare: asOwner && !viewer.isAdmin };
}
