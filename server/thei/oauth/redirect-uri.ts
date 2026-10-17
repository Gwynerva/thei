import type { OAuthRedirectView } from '#layers/thei/shared/oauth';
import { LOOPBACK_HOSTS } from './base';

/**
 * The address an app has the owner's browser sent back to, with the code that
 * becomes its key. Where a code goes is where a key goes, so it is checked
 * before anything is said to the app at all.
 */

/** Schemes that run something rather than open an app. */
const FORBIDDEN_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
  'about:',
]);

export const REDIRECT_URI_MAX = 2048;

/**
 * Whether an app may name this address to come back to: a site over HTTPS, a
 * program on this computer over plain HTTP, or an app's own scheme — never
 * one carrying a fragment or credentials, nor a scheme that runs code.
 */
export function redirectUriAllowed(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > REDIRECT_URI_MAX)
    return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === 'https:') return Boolean(url.hostname);
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname);
  // An app's own scheme: `com.example.app:/callback`.
  return /^[a-z][a-z0-9+.-]*:$/i.test(url.protocol);
}

/**
 * Whether an address the app asks for is one it registered: the same, but
 * for the port of a program on this computer, which picks a free one each
 * time (OAuth 2.1, 7.5.1.3).
 */
export function redirectUriMatches(registered: string, given: string) {
  if (registered === given) return true;
  let a: URL;
  let b: URL;
  try {
    a = new URL(registered);
    b = new URL(given);
  } catch {
    return false;
  }
  return (
    a.protocol === 'http:' &&
    b.protocol === 'http:' &&
    LOOPBACK_HOSTS.has(a.hostname) &&
    a.hostname === b.hostname &&
    a.pathname === b.pathname &&
    a.search === b.search
  );
}

/** Where an app sends the owner back to, as the consent page tells it. */
export function describeRedirect(
  redirectUri: string,
  clientHost: string,
): OAuthRedirectView {
  const url = new URL(redirectUri);
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
    return {
      kind: 'loopback',
      host: url.hostname,
      port: url.port || '80',
      matchesClient: false,
    };
  if (url.protocol === 'https:')
    return {
      kind: 'web',
      host: url.hostname,
      matchesClient: sameSite(url.hostname, clientHost),
    };
  return {
    kind: 'app',
    host: url.protocol.replace(/:$/, ''),
    matchesClient: false,
  };
}

/** Whether two hosts belong to one site: the same, or one beneath the other. */
function sameSite(a: string, b: string) {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}
