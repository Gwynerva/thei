import type { Database } from 'better-sqlite3';
import type { H3Event } from 'h3';
import { getTokenCookie, hashSessionToken } from './token';

/**
 * The admins a site closed for an update recognises before its sessions are
 * loaded.
 *
 * Sessions are read into memory only once the migrations are done
 * (`bootAdminSessions`), since until then the schema may still be changing.
 * Yet the update screen has to know its admin from the moment the site
 * closes: the steps, a failed migration's message and the retry button are
 * the admin's alone, and a visitor sees only that the site is unavailable.
 * So the tokens of the active sessions are read first, raw and read-only,
 * from the table as it stands before any migration, and kept by their hash.
 * A row has one of two shapes: up to 0.0.6 it holds the token itself
 * (`token`, and `previousToken` on a site that ran a build of 0.0.7 before
 * its release), and since migration `0.0.7/003-session-token-hashes` only
 * their hashes (`tokenHash`, `previousTokenHash`). A table that cannot be
 * read that way only means nobody is recognised until the sessions are
 * loaded as usual.
 */
const closedSiteTokens = new Map<string, number>();

/** The hash a row keeps of a token, under either of its two names. */
function rowTokenHash(hash: unknown, token: unknown) {
  if (typeof hash === 'string') return hash;
  if (typeof token === 'string') return hashSessionToken(token);
  return undefined;
}

export function rememberClosedSiteAdmins(rawDb: Database) {
  closedSiteTokens.clear();
  let rows: { data: unknown }[];
  try {
    rows = rawDb.prepare('SELECT data FROM "admin-sessions"').all() as {
      data: unknown;
    }[];
  } catch {
    return;
  }
  const now = Date.now();
  for (const row of rows) {
    try {
      const session =
        typeof row.data === 'string' ? JSON.parse(row.data) : undefined;
      const tokenHash = rowTokenHash(session?.tokenHash, session?.token);
      if (
        session?.state !== 'active' ||
        tokenHash === undefined ||
        typeof session.expiresAt !== 'number' ||
        session.expiresAt <= now
      )
        continue;
      closedSiteTokens.set(tokenHash, session.expiresAt);
      // A browser that missed the cookie of the last rotation still holds the
      // token it replaced (`rotateAdminSessionTokenIfNeeded`), until the
      // grace that began once the new one was seen is over.
      const previousTokenHash = rowTokenHash(
        session.previousTokenHash,
        session.previousToken,
      );
      if (previousTokenHash === undefined) continue;
      const previousExpiresAt =
        typeof session.previousTokenExpiresAt === 'number'
          ? Math.min(session.expiresAt, session.previousTokenExpiresAt)
          : session.expiresAt;
      if (previousExpiresAt > now)
        closedSiteTokens.set(previousTokenHash, previousExpiresAt);
    } catch {
      // A row that cannot be read signs nobody in.
    }
  }
}

/** Whether the request carries the token of a session remembered above. */
export function isClosedSiteAdmin(event: H3Event) {
  const token = getTokenCookie(event);
  if (!token) return false;
  const expiresAt = closedSiteTokens.get(hashSessionToken(token));
  return expiresAt !== undefined && expiresAt > Date.now();
}
