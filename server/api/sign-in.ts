import type { SignInData } from '#layers/thei/shared/api/sign-in';
import {
  createAuthToken,
  logSignIn,
  TOKEN_COOKIE,
  tokenCookieOptions,
} from '../thei/auth';
import { verifyPassword } from '../thei/password';

type SignInResponse = { type: 'success' } | { type: 'error'; message: string };

export default defineEventHandler(async (event): Promise<SignInResponse> => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';

  if (isRateLimited(ip)) {
    return {
      type: 'error',
      message: 'Too many sign-in attempts! Try again later.',
    };
  }

  const body = await readBody<SignInData>(event);
  const signInDataOrError = validateSignInData(body);

  if (typeof signInDataOrError === 'string') {
    return {
      type: 'error',
      message: signInDataOrError,
    };
  }

  const token = createAuthToken();
  setCookie(event, TOKEN_COOKIE, token, tokenCookieOptions);
  const userAgent = getHeader(event, 'user-agent') ?? '';
  await logSignIn(ip, userAgent);
  return { type: 'success' };
});

function validateSignInData(signInData: SignInData): string | SignInData {
  const invalidMessage = THEI_SERVER.phrase.invalid_secret_phrase_or_password;

  const secretPhrase = signInData.secretPhrase?.trim();
  if (secretPhrase !== THEI_SERVER.config.secretPhrase) {
    return invalidMessage;
  }

  const password = signInData.password ?? '';
  const { hash, salt, iterations, fallback } = THEI_SERVER.config.password;
  const isValidPassword = verifyPassword(password, { hash, salt, iterations });
  const isValidFallback = !!fallback && password === fallback;
  if (!isValidPassword && !isValidFallback) {
    return invalidMessage;
  }

  return {
    secretPhrase,
    password,
  };
}

//
// Rate Limiting Sign-In Attempts
//

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
