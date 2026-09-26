import { createHash, randomBytes } from 'node:crypto';

/**
 * Tokens for temporary links.
 *
 * A token is random and long enough that guessing is hopeless. A sign-in
 * link stores only its hash: whoever reads the database — a leaked backup, a
 * stray copy of `content/` — still cannot sign in. There is no secret to
 * stretch here, so a single SHA-256 is the right primitive; the lookup is by
 * hash, which is exact, so no comparison timing leaks either. A share link
 * keeps its token as is (see `share-links.ts`): it opens nothing the database
 * itself does not already hold.
 */
export function createAccessToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Shape check before a database lookup, to keep junk out of queries. */
export function isAccessTokenShape(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(value);
}
