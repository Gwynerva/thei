import { createHash } from 'node:crypto';
import { defineMigration } from './types';

/** A token as a session keeps it now: its SHA-256, in hex. */
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * An admin session keeps only the hash of its token, so a backup or a copy
 * of the database signs nobody in; the browser's cookie alone holds the
 * token. A row up to 0.0.6 holds `token` itself, and one written by a build
 * of 0.0.7 before its release may hold the token a rotation replaced,
 * `previousToken`, too.
 *
 * A browser that still shows the previous token is sent the current one
 * again, made from it with a salt the row keeps (`rotatedToken` in
 * `server/thei/admin-session/token.ts`). A current token made before has no
 * such salt and cannot be sent again, so a previous token whose replacement
 * was never seen is let go: a browser usually did get the cookie. One whose
 * replacement was seen keeps its hash through the seconds of grace left.
 * A row with no raw token is left as it is, so running this again changes
 * nothing.
 */
export default defineMigration({
  id: '0.0.7/003-session-token-hashes',
  version: '0.0.7',
  title: {
    en: 'Keep admin sessions without their tokens',
    ru: 'Хранить сессии администратора без их токенов',
  },
  description: {
    en: 'The database and its backups keep only a hash of what signs a browser in; the browser alone keeps the token.',
    ru: 'База данных и её резервные копии хранят только хеш того, чем браузер входит в админ-панель; сам токен остаётся лишь в браузере.',
  },
  up({ rawDb }) {
    const rows = rawDb
      .prepare('SELECT sessionUuid, data FROM `admin-sessions`')
      .all() as { sessionUuid: string; data: string }[];
    const update = rawDb.prepare(
      'UPDATE `admin-sessions` SET data = ? WHERE sessionUuid = ?',
    );
    for (const row of rows) {
      let session: Record<string, unknown>;
      try {
        session = JSON.parse(row.data);
      } catch {
        continue;
      }
      if (typeof session !== 'object' || session === null) continue;
      const { token, previousToken } = session;
      if (typeof token !== 'string' && typeof previousToken !== 'string')
        continue;

      if (typeof token === 'string') session.tokenHash = hashToken(token);
      if (
        typeof previousToken === 'string' &&
        typeof session.previousTokenExpiresAt === 'number'
      )
        session.previousTokenHash = hashToken(previousToken);
      delete session.token;
      delete session.previousToken;
      update.run(JSON.stringify(session), row.sessionUuid);
    }
  },
});
