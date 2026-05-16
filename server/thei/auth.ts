import { randomBytes } from 'node:crypto';
import type { H3Event } from 'h3';
import { UAParser } from 'ua-parser-js';
import { lt, sql } from 'drizzle-orm';

const TOKEN_TTL = 7 * 24 * 60 * 60 * 1_000; // 7 days
const RENEW_THRESHOLD = 60 * 60 * 1_000; // 1h
const CLEANUP_INTERVAL = 60 * 60 * 1_000; // 1h

export const TOKEN_COOKIE = 'thei-auth-token';
export const TOKEN_MAX_AGE = TOKEN_TTL / 1_000; // seconds, for cookie maxAge

export const tokenCookieOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  maxAge: TOKEN_MAX_AGE,
  path: '/' as const,
  secure: !import.meta.dev,
};

interface TokenEntry {
  expiresAt: number;
}

const tokenStore = new Map<string, TokenEntry>();

function persistTokenStore(): void {
  useStorage('thei')
    .setItem('auth-tokens.json', Object.fromEntries(tokenStore))
    .catch(() => {});
}

export async function loadTokenStore(): Promise<void> {
  const stored =
    await useStorage('thei').getItem<Record<string, TokenEntry>>(
      'auth-tokens.json',
    );
  if (!stored) return;
  const now = Date.now();
  let hadExpired = false;
  for (const [token, entry] of Object.entries(stored) as [
    string,
    TokenEntry,
  ][]) {
    if (now < entry.expiresAt) {
      tokenStore.set(token, entry);
    } else {
      hadExpired = true;
    }
  }
  if (hadExpired) persistTokenStore();
}

setInterval(async () => {
  const now = Date.now();
  for (const [token, entry] of tokenStore) {
    if (now >= entry.expiresAt) tokenStore.delete(token);
  }
  persistTokenStore();

  try {
    const { db, schema } = THEI_SERVER.useDb();

    await db
      .delete(schema.signIns)
      .where(lt(schema.signIns.at, sql`(datetime('now', '-1 year'))`));
  } catch {
    // Never let cleanup break the interval
  }
}, CLEANUP_INTERVAL);

export function createAuthToken(): string {
  const token = randomBytes(32).toString('hex');
  tokenStore.set(token, { expiresAt: Date.now() + TOKEN_TTL });
  persistTokenStore();
  return token;
}

export function isAdminRequest(event: H3Event): boolean {
  const token = getCookie(event, TOKEN_COOKIE) ?? '';
  if (!token) return false;

  const entry = tokenStore.get(token);
  if (!entry) return false;

  const now = Date.now();
  if (now >= entry.expiresAt) {
    tokenStore.delete(token);
    return false;
  }

  if (entry.expiresAt - now <= RENEW_THRESHOLD) {
    tokenStore.delete(token);
    const newToken = createAuthToken();
    setCookie(event, TOKEN_COOKIE, newToken, tokenCookieOptions);
  }

  return true;
}

export function deleteAuthToken(token: string): void {
  tokenStore.delete(token);
  persistTokenStore();
}

const PRIVATE_IP_PREFIXES = ['127.', '10.', '192.168.', '172.16.', '::1'];

function isPrivateIp(ip: string): boolean {
  return ip === 'unknown' || PRIVATE_IP_PREFIXES.some((p) => ip.startsWith(p));
}

async function fetchLocation(ip: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { city?: string; country_name?: string };
    const parts = [data.city, data.country_name].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function logSignIn(ip: string, userAgent: string): Promise<void> {
  try {
    const { db, schema } = THEI_SERVER.useDb();
    const location = isPrivateIp(ip) ? undefined : await fetchLocation(ip);
    const parser = new UAParser(userAgent);
    const ua = `${parser.getBrowser().name ?? 'Unknown browser'} on ${parser.getOS().name ?? 'Unknown OS'} (${parser.getDevice().type ?? 'Unknown Device'})`;
    await db
      .insert(schema.signIns)
      .values({ ip, location, ua })
      .onConflictDoUpdate({
        target: [schema.signIns.ip, schema.signIns.at],
        set: { location: sql`excluded.location` },
      });
  } catch {
    // Never let login logging break auth
  }
}

export async function bootTheiAuth() {
  await loadTokenStore();
  THEI_SERVER.console.tag('Boot').log('Auth system ready!');
}
