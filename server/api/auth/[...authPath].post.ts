import type { AuthResponse } from '#layers/thei/shared/api/auth-response';
import {
  createAuthToken,
  logLogin,
  TOKEN_COOKIE,
  tokenCookieOptions,
} from '../../thei/auth';
import { verifyPassword } from '../../thei/password';

const rateLimitCooldown = 3_000;
const clearRateLimitColdown = 60_000;
const rateLimitTable: Record<string, number> = {};

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const lastAttempt = rateLimitTable[ip] ?? 0;
  const rateLimited = now - lastAttempt < rateLimitCooldown;
  rateLimitTable[ip] = now;
  return rateLimited;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, lastAttempt] of Object.entries(rateLimitTable)) {
    if (now - lastAttempt > clearRateLimitColdown) {
      delete rateLimitTable[ip];
    }
  }
}, clearRateLimitColdown);

export default defineEventHandler(async (event): Promise<AuthResponse> => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';

  if (isRateLimited(ip)) {
    return { type: 'error', phraseId: 'auth_error_rate_limited' };
  }

  const body = await readBody<{ password?: string }>(event);
  const password = body?.password ?? '';

  if (!password) {
    return { type: 'error', phraseId: 'auth_error_wrong_password' };
  }

  const { hash, salt, iterations, fallback } = THEI_SERVER.config.password;

  const isValidPassword = verifyPassword(password, { hash, salt, iterations });
  const isValidFallback = !!fallback && password === fallback;

  if (isValidPassword || isValidFallback) {
    const token = createAuthToken();
    setCookie(event, TOKEN_COOKIE, token, tokenCookieOptions);
    logLogin(ip).catch(() => {});
    return { type: 'success' };
  }

  return { type: 'error', phraseId: 'auth_error_wrong_password' };
});
