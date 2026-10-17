import { and, eq, lt } from 'drizzle-orm';
import { sweepClients } from './clients';
import { pruneOAuthLimits } from './limits';

/** How long a request is kept past its expiry: long enough to catch a code used twice. */
const AFTER_EXPIRY_MS = 10 * 60 * 1000;

/**
 * The hourly sweep of what signing in leaves: requests past their time,
 * connections nothing renewed for a month, apps nothing needs. Never throws:
 * it runs on a timer.
 */
export function sweepOAuth(now = Date.now()) {
  try {
    const { db, schema } = THEI_SERVER.useDb();
    db.delete(schema.oauthAuthorizations)
      .where(lt(schema.oauthAuthorizations.expiresAt, now - AFTER_EXPIRY_MS))
      .run();
    db.delete(schema.apiTokens)
      .where(
        and(
          eq(schema.apiTokens.kind, 'oauth'),
          lt(schema.apiTokens.refreshExpiresAt, now),
        ),
      )
      .run();
    sweepClients(now);
    pruneOAuthLimits(now);
  } catch (error) {
    THEI_SERVER.console.error('OAuth maintenance failed:', error);
  }
}
