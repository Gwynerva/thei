import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { sessionDuration, tokenName } from './const';
import { sitePath } from '../site-url';

export function createToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * What the database keeps of a session's token. Only the browser's cookie
 * holds the token itself, so whoever reads the database — a backup, a stray
 * copy of `content/` — opens no session with it. As with a sign-in link
 * (`hashAccessToken`), the token is random and long, so a single SHA-256 is
 * enough, and the lookup by hash is exact.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * The token a rotation replaces `previous` with: made from it with a random
 * salt. A browser that missed the new cookie still shows the previous token,
 * and is sent the new one again, made anew from it; the database keeps only
 * the salt and the hashes, and can make neither.
 */
export function rotatedToken(previous: string, salt: string): string {
  return createHmac('sha256', salt).update(previous).digest('hex');
}

export function setTokenCookie(event: H3Event, token: string) {
  setCookie(event, tokenName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: !import.meta.dev,
    // Scoped to the site's own folder, so a site served from a subfolder does
    // not hand its session to whatever else lives on the domain.
    path: sitePath('/'),
    maxAge: sessionDuration / 1000,
  });
}

export function clearTokenCookie(event: H3Event) {
  deleteCookie(event, tokenName, { path: sitePath('/') });
}

export function getTokenCookie(event: H3Event) {
  return getCookie(event, tokenName);
}
