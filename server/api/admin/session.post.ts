import type { H3Event } from 'h3';
import type { SignInData } from '#layers/thei/shared/api/sign-in';
import { secretsMatch, verifyPassword } from '../../thei/password';
import { createAdminSession } from '../../thei/admin-session';
import { isSignInRateLimited } from '../../thei/access-links/rate-limit';

type SignInResponse = { type: 'success' } | { type: 'error'; message: string };

export default defineEventHandler(async (event): Promise<SignInResponse> => {
  if (isSignInRateLimited(event)) {
    return {
      type: 'error',
      message: THEI_SERVER.phrase.sign_in_too_many_attempts,
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

  const secretPhrase = signInData.secretPhrase?.trim() ?? '';
  if (!secretsMatch(secretPhrase, THEI_SERVER.config.secretPhrase)) {
    return invalidMessage;
  }

  const password = signInData.password ?? '';
  const { hash, salt, iterations, fallback } = THEI_SERVER.config.password;
  const isValidPassword = verifyPassword(password, { hash, salt, iterations });
  const isValidFallback = !!fallback && secretsMatch(password, fallback);
  if (!isValidPassword && !isValidFallback) {
    return invalidMessage;
  }

  return {
    secretPhrase,
    password,
  };
}
