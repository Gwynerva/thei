import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';

export interface PasswordData {
  hash: string;
  salt: string;
  iterations: number;
}

export function generatePasswordData(password: string): PasswordData {
  const salt = randomBytes(32).toString('hex');
  const iterations =
    Math.floor(Math.random() * (200_000 - 100_000 + 1)) + 100_000;
  const hash = computePasswordHash(password, salt, iterations);
  return { hash, salt, iterations };
}

export function computePasswordHash(
  password: string,
  salt: string,
  iterations: number,
): string {
  return pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
}

export function verifyPassword(password: string, data: PasswordData): boolean {
  const computed = computePasswordHash(password, data.salt, data.iterations);
  return secretsMatch(computed, data.hash);
}

/**
 * Compare two secrets without letting the time taken reveal how far the
 * comparison got. `timingSafeEqual` requires equal lengths, so a length
 * mismatch is answered directly — it leaks only the length, never the content.
 */
export function secretsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
