import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3';
import { randomBytes } from 'node:crypto';
import { sessionDuration, tokenName } from './const';
import { sitePath } from '../site-url';

export function createToken(): string {
  return randomBytes(32).toString('hex');
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
