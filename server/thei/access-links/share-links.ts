import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm';
import { getCookie, setCookie, type H3Event } from 'h3';
import {
  SHARE_LINK_DURATIONS,
  type ShareGrantPath,
  type ShareLinkDuration,
  type ShareLinkEntityType,
} from '#layers/thei/shared/share-link';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import { sitePath } from '../site-url';
import {
  createAccessToken,
  hashAccessToken,
  isAccessTokenShape,
} from './token';

/**
 * Temporary links that let someone else look at one private project, event or
 * page.
 *
 * The point is that the link stops working by itself. Sharing something
 * private with a person who then forgets about the link is normally how it
 * leaks; here the leaked copy is already dead.
 *
 * The grant is scoped to a single entity and everything that belongs to it —
 * its stages, sections, files and media. It never widens the rest of the site:
 * related projects, lists, search and the timeline still answer as they would
 * to any visitor.
 */
export const SHARE_COOKIE_NAME = 'thei-share';

/** A browser carries at most this many grants at once. */
const MAX_COOKIE_TOKENS = 10;

/** And the owner keeps at most this many live links per entity. */
const MAX_LINKS_PER_ENTITY = 20;

export interface ShareLinkRecord {
  shareUuid: string;
  entityType: ShareLinkEntityType;
  entityUuid: string;
  createdAt: number;
  expiresAt: number;
  /** Only ever returned by `createShareLink`; never stored in the clear. */
  token?: string;
  url?: string;
}

export function shareLinkPath(token: string): string {
  return `/share/${token}/`;
}

/** Where a grant leads: the public address of the entity it was made for. */
export async function shareGrantPath(
  entityType: ShareLinkEntityType,
  entityUuid: string,
): Promise<string | undefined> {
  if (entityType === 'project') {
    const project = await THEI_SERVER.projects.findByUuid(entityUuid);
    return project
      ? buildProjectUrl(project.humanReadableSlug, project.publicId)
      : undefined;
  }
  if (entityType === 'event') {
    const stored = await THEI_SERVER.events.findByUuid(entityUuid);
    return stored
      ? buildEventUrl(stored.humanReadableSlug, stored.publicId)
      : undefined;
  }
  const page = await THEI_SERVER.pages.findByUuid(entityUuid);
  return page ? buildPageUrl(page.slug) : undefined;
}

export async function createShareLink(
  entityType: ShareLinkEntityType,
  entityUuid: string,
  duration: ShareLinkDuration,
): Promise<ShareLinkRecord> {
  const { db, schema } = THEI_SERVER.useDb();
  cleanupExpiredShareLinks();
  const existing = listShareLinks(entityType, entityUuid);
  if (existing.length >= MAX_LINKS_PER_ENTITY)
    throw createError({
      statusCode: 429,
      message: THEI_SERVER.phrase.share_link_too_many,
    });

  const token = createAccessToken();
  const now = Date.now();
  const row = {
    shareUuid: await generateUniqueId(EntityPrefix.Share, async (id) =>
      Boolean(
        !db
          .select()
          .from(schema.shareLinks)
          .where(eq(schema.shareLinks.shareUuid, id))
          .get(),
      ),
    ),
    tokenHash: hashAccessToken(token),
    entityType,
    entityUuid,
    createdAt: now,
    expiresAt: now + SHARE_LINK_DURATIONS[duration],
  };
  db.insert(schema.shareLinks).values(row).run();
  const { tokenHash: _tokenHash, ...record } = row;
  return { ...record, token, url: shareLinkPath(token) };
}

export function listShareLinks(
  entityType: ShareLinkEntityType,
  entityUuid: string,
): ShareLinkRecord[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.shareLinks)
    .where(
      and(
        eq(schema.shareLinks.entityType, entityType),
        eq(schema.shareLinks.entityUuid, entityUuid),
        gt(schema.shareLinks.expiresAt, Date.now()),
      ),
    )
    .orderBy(asc(schema.shareLinks.expiresAt))
    .all()
    .map(({ tokenHash: _tokenHash, ...row }) => row);
}

/** Moves the expiry, counted from now, so "extend" means the same everywhere. */
export function extendShareLink(
  shareUuid: string,
  duration: ShareLinkDuration,
): ShareLinkRecord | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.shareUuid, shareUuid))
    .get();
  if (!row) return undefined;
  const expiresAt = Date.now() + SHARE_LINK_DURATIONS[duration];
  db.update(schema.shareLinks)
    .set({ expiresAt })
    .where(eq(schema.shareLinks.shareUuid, shareUuid))
    .run();
  const { tokenHash: _tokenHash, ...record } = row;
  return { ...record, expiresAt };
}

export function revokeShareLink(shareUuid: string): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  return (
    db
      .delete(schema.shareLinks)
      .where(eq(schema.shareLinks.shareUuid, shareUuid))
      .run().changes > 0
  );
}

export function resolveShareToken(token: string): ShareLinkRecord | undefined {
  if (!isAccessTokenShape(token)) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select()
    .from(schema.shareLinks)
    .where(
      and(
        eq(schema.shareLinks.tokenHash, hashAccessToken(token)),
        gt(schema.shareLinks.expiresAt, Date.now()),
      ),
    )
    .get();
  if (!row) return undefined;
  const { tokenHash: _tokenHash, ...record } = row;
  return record;
}

/**
 * The grants a request carries: `project:uuid` / `event:uuid` to the moment
 * each one runs out, which the page shows to the reader.
 */
export function readShareGrants(event: H3Event): Map<string, number> {
  const cookie = getCookie(event, SHARE_COOKIE_NAME);
  const grants = new Map<string, number>();
  if (!cookie) return grants;
  const hashes = cookie
    .split('.')
    .filter(isAccessTokenShape)
    .slice(0, MAX_COOKIE_TOKENS)
    .map(hashAccessToken);
  if (!hashes.length) return grants;
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.shareLinks)
    .where(
      and(
        inArray(schema.shareLinks.tokenHash, hashes),
        gt(schema.shareLinks.expiresAt, Date.now()),
      ),
    )
    .all();
  for (const row of rows) {
    const key = `${row.entityType}:${row.entityUuid}`;
    grants.set(key, Math.max(grants.get(key) ?? 0, row.expiresAt));
  }
  return grants;
}

/** Adds a token to the browser's cookie, keeping the ones already there. */
export function rememberShareToken(event: H3Event, token: string): void {
  const previous = (getCookie(event, SHARE_COOKIE_NAME) ?? '')
    .split('.')
    .filter(isAccessTokenShape)
    .filter((value) => value !== token);
  const tokens = [token, ...previous].slice(0, MAX_COOKIE_TOKENS);
  setCookie(event, SHARE_COOKIE_NAME, tokens.join('.'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: sitePath('/'),
    maxAge: Math.ceil(Math.max(...Object.values(SHARE_LINK_DURATIONS)) / 1000),
  });
}

export function cleanupExpiredShareLinks(): void {
  const { db, schema } = THEI_SERVER.useDb();
  db.delete(schema.shareLinks)
    .where(lt(schema.shareLinks.expiresAt, Date.now()))
    .run();
}

/**
 * The grants as addresses.
 *
 * Public responses identify entities by their public id, never by uuid, so the
 * page cannot match a grant by uuid. The address is what both sides already
 * agree on.
 */
export async function resolveShareGrantPaths(
  grants: Map<string, number>,
): Promise<ShareGrantPath[]> {
  const paths: ShareGrantPath[] = [];
  for (const [key, expiresAt] of grants) {
    const [entityType, entityUuid] = key.split(':') as [string, string];
    const path = await shareGrantPath(
      entityType as ShareLinkEntityType,
      entityUuid,
    );
    if (path) paths.push({ path, expiresAt });
  }
  return paths;
}
