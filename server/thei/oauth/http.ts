import {
  createError,
  getRequestHeader,
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
  type H3Event,
} from 'h3';
import { readLimitedText } from '../request';
import { oauthAvailable } from './base';

/**
 * How the OAuth endpoints answer: an app calls them from anywhere — a
 * browser page of claude.ai as well as a program — so they let any origin in
 * and carry no cookie; what they hand out is never cached; a body is read no
 * further than a small limit.
 */

/** The endpoints are not there at all while signing in is not possible. */
export function requireOAuth(event: H3Event) {
  if (!oauthAvailable(event)) throw createError({ statusCode: 404 });
}

/** Lets a page of any site call, as an app in a browser does. */
function allowAnyOrigin(event: H3Event) {
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, MCP-Protocol-Version',
    'Access-Control-Max-Age': '86400',
  });
}

/** A browser's preflight, answered and done. */
export function answeredPreflight(event: H3Event): boolean {
  allowAnyOrigin(event);
  if (event.method !== 'OPTIONS') return false;
  setResponseStatus(event, 204);
  return true;
}

/** What an OAuth endpoint answers: its status and its JSON body. */
export interface OAuthAnswer {
  status: number;
  body: Record<string, unknown>;
}

/** An OAuth error (RFC 6749, 5.2): its code, and why in words. */
export function oauthError(
  error: string,
  description: string,
  status = 400,
): OAuthAnswer {
  return { status, body: { error, error_description: description } };
}

/** Sends an answer that holds keys or codes: never kept by anything on the way. */
export function oauthAnswer(event: H3Event, answer: OAuthAnswer) {
  setResponseStatus(event, answer.status);
  setResponseHeaders(event, {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  });
  return answer.body;
}

/**
 * A form body (`application/x-www-form-urlencoded`), as the token endpoint
 * takes it; null when it is another kind, too large, or names a parameter
 * twice, which nothing can trust.
 */
export async function readForm(
  event: H3Event,
  max = 16 * 1024,
): Promise<Record<string, string> | null> {
  const type = getRequestHeader(event, 'content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/x-www-form-urlencoded'))
    return null;
  const text = await readLimitedText(event, max);
  if (text === undefined) return null;
  const form: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) {
    if (key in form) return null;
    form[key] = value;
  }
  return form;
}

/** A JSON body, as registration takes it; undefined when it is not one. */
export async function readJson(
  event: H3Event,
  max = 16 * 1024,
): Promise<unknown> {
  const type = getRequestHeader(event, 'content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) return undefined;
  const text = await readLimitedText(event, max);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Discovery documents: public, the same for everyone, kept for a while. */
export function discoveryAnswer<T>(event: H3Event, body: T): T {
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300');
  return body;
}
