import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm';
import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3';
import {
  extendedShareLinkExpiry,
  SHARE_LINK_DURATIONS,
  SHARE_LINK_LABEL_MAX,
  shareGrantKey,
  type ShareGrantPath,
  type ShareLinkDuration,
  type ShareLinkEntityType,
  type ShareLinkItem,
} from '#layers/thei/shared/share-link';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import { sitePath, siteUrl } from '../site-url';
import { createAccessToken, isAccessTokenShape } from './token';

/**
 * Temporary links that let someone else look at one private project, event,
 * page or diary entry.
 *
 * The point is that the link stops working by itself. Sharing something
 * private with a person who then forgets about the link is normally how it
 * leaks; here the leaked copy is already dead.
 *
 * The grant is scoped to a single entity and everything that belongs to it —
 * its stages, sections, files and media. It never widens the rest of the site:
 * related projects, lists, search and the timeline still answer as they would
 * to any visitor.
 *
 * The token is stored as is, so the owner can copy a link again whenever they
 * need it. Hashing it would guard nothing worth guarding: whoever reads the
 * database already holds everything a link could show them.
 */
export const SHARE_COOKIE_NAME = 'thei-share';

/** A browser carries at most this many grants at once. */
const MAX_COOKIE_TOKENS = 10;

/**
 * How long the browser keeps the cookie. Longer than any link lives, because
 * a link can be extended after it was opened, and the cookie only carries
 * tokens: whether one still opens anything is decided on the server, on every
 * request.
 */
const SHARE_COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;

/** And the owner keeps at most this many live links per entity. */
const MAX_LINKS_PER_ENTITY = 20;

export interface ShareLinkRecord {
  shareUuid: string;
  token: string;
  entityType: ShareLinkEntityType;
  entityUuid: string;
  label: string;
  createdAt: number;
  extendedAt: number | null;
  expiresAt: number;
}

export function shareLinkPath(token: string): string {
  return `/share/${token}/`;
}

/** A link as the owner's panel gets it: with its full address to copy. */
export function toShareLinkItem(
  event: H3Event,
  { token, ...link }: ShareLinkRecord,
): ShareLinkItem {
  return { ...link, url: siteUrl(event, shareLinkPath(token)) };
}

/**
 * What a link is made for: the public address of the entity, and whether the
 * entity is private as a whole. `undefined` when it no longer exists.
 */
export async function findShareTarget(
  entityType: ShareLinkEntityType,
  entityUuid: string,
): Promise<{ path: string; access: ProjectEventAccessLevel } | undefined> {
  switch (entityType) {
    case 'project': {
      const project = await THEI_SERVER.projects.findByUuid(entityUuid);
      return (
        project && {
          path: buildProjectUrl(project.humanReadableSlug, project.publicId),
          access: project.access,
        }
      );
    }
    case 'event': {
      const stored = await THEI_SERVER.events.findByUuid(entityUuid);
      return (
        stored && {
          path: buildEventUrl(stored.humanReadableSlug, stored.publicId),
          access: stored.access,
        }
      );
    }
    case 'diary-entry': {
      const entry = await THEI_SERVER.diary.findByUuid(entityUuid);
      return entry && { path: buildDiaryUrl(entry.date), access: entry.access };
    }
    case 'page': {
      const page = await THEI_SERVER.pages.findByUuid(entityUuid);
      return page && { path: buildPageUrl(page.slug), access: page.access };
    }
  }
}

/**
 * The owner's note on who the link is for, as one short line: no control
 * characters, no runs of spaces, and no longer than a name needs to be.
 */
export function normalizeShareLinkLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const line = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(line).slice(0, SHARE_LINK_LABEL_MAX).join('').trim();
}

export async function createShareLink(
  entityType: ShareLinkEntityType,
  entityUuid: string,
  duration: ShareLinkDuration,
  label = '',
): Promise<ShareLinkRecord> {
  const { db, schema } = THEI_SERVER.useDb();
  cleanupExpiredShareLinks();
  if (listShareLinks(entityType, entityUuid).length >= MAX_LINKS_PER_ENTITY)
    throw createError({
      statusCode: 429,
      message: THEI_SERVER.phrase.share_link_too_many,
    });

  const now = Date.now();
  const row: ShareLinkRecord = {
    shareUuid: await generateUniqueId(EntityPrefix.Share, async (id) =>
      Boolean(
        !db
          .select()
          .from(schema.shareLinks)
          .where(eq(schema.shareLinks.shareUuid, id))
          .get(),
      ),
    ),
    token: createAccessToken(),
    entityType,
    entityUuid,
    label: normalizeShareLinkLabel(label),
    createdAt: now,
    extendedAt: null,
    expiresAt: now + SHARE_LINK_DURATIONS[duration],
  };
  db.insert(schema.shareLinks).values(row).run();
  return row;
}

/** The live links of one entity, the one closing soonest first. */
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
    .all();
}

/**
 * Adds the duration to what is left, up to a day ahead, and starts a new term
 * from now. A link that has already run out stays dead: bringing it back
 * would reopen an address the owner may long since have forgotten handing
 * out.
 */
export function extendShareLink(
  shareUuid: string,
  duration: ShareLinkDuration,
): ShareLinkRecord | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const now = Date.now();
  const row = db
    .select()
    .from(schema.shareLinks)
    .where(
      and(
        eq(schema.shareLinks.shareUuid, shareUuid),
        gt(schema.shareLinks.expiresAt, now),
      ),
    )
    .get();
  if (!row) return undefined;
  const expiresAt = extendedShareLinkExpiry(row.expiresAt, duration, now);
  db.update(schema.shareLinks)
    .set({ expiresAt, extendedAt: now })
    .where(eq(schema.shareLinks.shareUuid, shareUuid))
    .run();
  return { ...row, expiresAt, extendedAt: now };
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

/** Drops an entity's links together with the entity, inside its transaction. */
export function deleteShareLinks(
  tx: any,
  schema: any,
  entityType: ShareLinkEntityType,
  entityUuid: string,
): void {
  tx.delete(schema.shareLinks)
    .where(
      and(
        eq(schema.shareLinks.entityType, entityType),
        eq(schema.shareLinks.entityUuid, entityUuid),
      ),
    )
    .run();
}

export function resolveShareToken(token: string): ShareLinkRecord | undefined {
  if (!isAccessTokenShape(token)) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.shareLinks)
    .where(
      and(
        eq(schema.shareLinks.token, token),
        gt(schema.shareLinks.expiresAt, Date.now()),
      ),
    )
    .get();
}

function readCookieTokens(event: H3Event): string[] {
  return (getCookie(event, SHARE_COOKIE_NAME) ?? '')
    .split('.')
    .filter(isAccessTokenShape)
    .slice(0, MAX_COOKIE_TOKENS);
}

function writeCookieTokens(event: H3Event, tokens: string[]): void {
  const path = sitePath('/');
  if (!tokens.length) {
    deleteCookie(event, SHARE_COOKIE_NAME, { path });
    return;
  }
  setCookie(event, SHARE_COOKIE_NAME, tokens.join('.'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path,
    maxAge: SHARE_COOKIE_MAX_AGE_S,
  });
}

export interface ShareCookie {
  /** `type:uuid` of each open entity, to the moment its last link runs out. */
  grants: Map<string, number>;
  /** Whether the cookie still carries tokens that open nothing. */
  stale: boolean;
  /** The tokens that still work, in the cookie's own order. */
  liveTokens: string[];
}

/** What a request's cookie opens, with one query. */
export function readShareCookie(event: H3Event): ShareCookie {
  const tokens = readCookieTokens(event);
  const grants = new Map<string, number>();
  if (!tokens.length)
    return {
      grants,
      stale: Boolean(getCookie(event, SHARE_COOKIE_NAME)),
      liveTokens: [],
    };
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.shareLinks)
    .where(
      and(
        inArray(schema.shareLinks.token, tokens),
        gt(schema.shareLinks.expiresAt, Date.now()),
      ),
    )
    .all();
  const live = new Set<string>();
  for (const row of rows) {
    live.add(row.token);
    const key = shareGrantKey(row.entityType, row.entityUuid);
    grants.set(key, Math.max(grants.get(key) ?? 0, row.expiresAt));
  }
  const liveTokens = tokens.filter((token) => live.has(token));
  return { grants, stale: liveTokens.length !== tokens.length, liveTokens };
}

/** The grants a request carries: `type:uuid` to the moment each runs out. */
export function readShareGrants(event: H3Event): Map<string, number> {
  return readShareCookie(event).grants;
}

/** Adds a token to the browser's cookie, keeping the live ones already there. */
export function rememberShareToken(event: H3Event, token: string): void {
  const previous = readShareCookie(event).liveTokens;
  writeCookieTokens(
    event,
    [token, ...previous.filter((value) => value !== token)].slice(
      0,
      MAX_COOKIE_TOKENS,
    ),
  );
}

/** Rewrites the cookie with only the tokens that still open something. */
export function forgetDeadShareTokens(
  event: H3Event,
  cookie: ShareCookie,
): void {
  if (cookie.stale) writeCookieTokens(event, cookie.liveTokens);
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
    const split = key.indexOf(':');
    const target = await findShareTarget(
      key.slice(0, split) as ShareLinkEntityType,
      key.slice(split + 1),
    );
    if (target)
      paths.push({
        path: target.path,
        expiresAt,
        whole: target.access === ProjectEventAccessLevel.Private,
      });
  }
  return paths;
}
