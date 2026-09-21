import type { H3Event } from 'h3';
import { getRequestIp } from '../request';

const COOLDOWN_MS = 3000;
const attempts = new Map<string, number>();

/**
 * One sign-in attempt per IP per few seconds, for passwords and for one-time
 * links alike. Both are ways in, and both are worth slowing down to the point
 * where guessing is pointless.
 */
export function isSignInRateLimited(event: H3Event): boolean {
  const ip = getRequestIp(event) ?? 'unknown';
  const now = Date.now();
  const blockedUntil = attempts.get(ip) ?? 0;
  if (now < blockedUntil) return true;
  attempts.set(ip, now + COOLDOWN_MS);
  if (Math.random() < 0.01)
    for (const [key, expires] of attempts)
      if (now >= expires) attempts.delete(key);
  return false;
}
