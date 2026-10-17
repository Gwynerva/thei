import type { H3Event } from 'h3';
import { siteRoot } from '../site-url';

/**
 * Where the site's OAuth lives, by one root — the origin and the base path —
 * so the issuer an app is told, the `iss` it gets back and the server it is
 * pointed to are the same string, as RFC 9207 wants.
 */

/** The names of this computer, as an address's hostname gives them. */
export const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The issuer: the site's own address, without a trailing slash. */
export function oauthIssuer(event: H3Event): string {
  return siteRoot(event);
}

/** The address of the MCP endpoint, which keys are issued for. */
export function mcpResource(event: H3Event): string {
  return `${siteRoot(event)}/api/mcp`;
}

/**
 * Where an app learns which server to sign in at (RFC 9728). An app is
 * handed this address with every refusal and reads it as given, so it is
 * where the site answers — beneath its base path, for a site in a subfolder.
 */
export function resourceMetadataUrl(event: H3Event): string {
  return `${siteRoot(event)}/.well-known/oauth-protected-resource/api/mcp`;
}

/**
 * Whether apps may sign in: with AI on, and over HTTPS — a key sent in the
 * clear is a key given away — except on the owner's own machine, where an
 * app connects to `localhost`.
 */
export function oauthAvailable(event: H3Event): boolean {
  if (!THEI_SERVER.config.mcp.enabled) return false;
  const url = new URL(siteRoot(event));
  return url.protocol === 'https:' || LOOPBACK_HOSTS.has(url.hostname);
}
