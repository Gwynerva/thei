import type { H3Event } from 'h3';
import { randomBytes } from 'node:crypto';
import { sessionDuration, tokenName } from './const';

export function createToken(): string {
  return randomBytes(32).toString('hex');
}

export function setTokenCookie(event: H3Event, token: string) {
  setCookie(event, tokenName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: sessionDuration / 1000,
  });
}

export function clearTokenCookie(event: H3Event) {
  deleteCookie(event, tokenName);
}

export function getTokenCookie(event: H3Event) {
  return getCookie(event, tokenName);
}
