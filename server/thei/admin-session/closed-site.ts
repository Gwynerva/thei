import type { Database } from 'better-sqlite3';
import { getCookie, type H3Event } from 'h3';
import { tokenName } from './const';

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
 * from the table as it stands before any migration. It has kept one shape
 * since 0.0.1; a table that cannot be read that way only means nobody is
 * recognised until the sessions are loaded as usual.
 */
const closedSiteTokens = new Map<string, number>();

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
      if (
        session?.state === 'active' &&
        typeof session.token === 'string' &&
        typeof session.expiresAt === 'number' &&
        session.expiresAt > now
      )
        closedSiteTokens.set(session.token, session.expiresAt);
    } catch {
      // A row that cannot be read signs nobody in.
    }
  }
}

/** Whether the request carries the token of a session remembered above. */
export function isClosedSiteAdmin(event: H3Event) {
  const token = getCookie(event, tokenName);
  if (!token) return false;
  const expiresAt = closedSiteTokens.get(token);
  return expiresAt !== undefined && expiresAt > Date.now();
}
