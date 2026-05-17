import type { H3Event } from 'h3';
import type { SignInData } from '#layers/thei/shared/api/sign-in';
import { verifyPassword } from '../thei/password';
import { createAdminSession } from '../thei/admin-session';

type SignInResponse = { type: 'success' } | { type: 'error'; message: string };

export default defineEventHandler(async (event): Promise<SignInResponse> => {
  if (isRateLimited(event)) {
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

  await createAdminSession(event);
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

const rateLimits = new Map<string, number>();
const rateLimitCooldown = 3000;
function isRateLimited(event: H3Event): boolean {
  const ip = getRequestIP(event) ?? 'unknown';
  const now = Date.now();
  const blockedUntil = rateLimits.get(ip) ?? 0;

  if (now < blockedUntil) {
    return true;
  }

  rateLimits.set(ip, now + rateLimitCooldown);

  if (Math.random() < 0.01) {
    for (const [ip, expires] of rateLimits) {
      if (now >= expires) {
        rateLimits.delete(ip);
      }
    }
  }

  return false;
}
