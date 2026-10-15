import type { ApiTokenPreset, ApiTokenScope } from './api-token';

/**
 * Connecting an AI app by signing in: OAuth 2.1 with PKCE, as MCP clients —
 * claude.ai, ChatGPT, Claude Code — speak it. The app asks, the owner says
 * yes or no on a page of the site, and the app gets a connection: an access
 * key that lasts an hour and is renewed while it is used.
 */

/** How long an access key of a connection works before it is renewed. */
export const OAUTH_ACCESS_LIFETIME_MS = 60 * 60 * 1000;
/** How long a connection keeps without being used; every renewal resets it. */
export const OAUTH_REFRESH_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/** How long a request waits for the owner's word. */
export const OAUTH_REQUEST_LIFETIME_MS = 10 * 60 * 1000;
/** How long the one-time code the owner's yes gives the app works. */
export const OAUTH_CODE_LIFETIME_MS = 60 * 1000;
/**
 * How long after a renewal the refresh key it replaced is refused without
 * suspicion: two workers of one app renewing at once.
 */
export const OAUTH_REFRESH_GRACE_MS = 10 * 1000;

/** The prefixes of the keys a connection holds, as a secret scanner sees them. */
export const OAUTH_ACCESS_PREFIX = 'thei_at_';
export const OAUTH_REFRESH_PREFIX = 'thei_rt_';

/** A request's id: what its consent page is found by. */
export const OAUTH_REQUEST_ID = /^[A-Za-z0-9_-]{43}$/;

/**
 * Where signing in may lead back to: only a consent page of a waiting
 * request, so the address cannot send a visitor anywhere else.
 */
export function signInReturnPath(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^\/oauth\/consent\/[A-Za-z0-9_-]{43}\/$/.test(value)
    ? value
    : undefined;
}

/** Where an app sends the owner back to, as the consent page tells it. */
export interface OAuthRedirectView {
  /** `web` — a site; `loopback` — a program on this computer; `app` — an app's own address. */
  kind: 'web' | 'loopback' | 'app';
  /** The site's host, or the app's scheme. */
  host: string;
  port?: string;
  /** Whether it is the same site the app is known by. */
  matchesClient: boolean;
}

/** A waiting request, as its consent page shows it. */
export interface OAuthRequestView {
  requestId: string;
  client: {
    name: string;
    /** `cimd` — known by its own description at an address; `dcr` — named by itself. */
    kind: 'cimd' | 'dcr';
    /** The host of its description, or of its home page. */
    host: string;
    uri?: string;
  };
  redirect: OAuthRedirectView;
  requested: ApiTokenScope[];
  /** Connections this app has already. */
  connections: number;
  /** No more keys may be made until one is revoked. */
  limitReached: boolean;
  /** The name the connection gets unless the owner gives another. */
  label: string;
}

export interface OAuthDecision {
  allow: boolean;
  preset?: ApiTokenPreset;
  label?: string;
}

/** Where the browser goes on, with the app's answer in the address. */
export interface OAuthDecisionResponse {
  redirect: string;
}

/** Why a request was refused before the app could be told: the refusal page's words. */
export type OAuthRefusal =
  'client' | 'client_document' | 'redirect_uri' | 'request';
