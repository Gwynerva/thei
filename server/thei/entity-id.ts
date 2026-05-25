import { randomUUID } from 'node:crypto';

export const EntityPrefix = {
  Project: 'p',
  Asset: 'a',
  Session: 's',
} as const;

export type EntityPrefixValue =
  (typeof EntityPrefix)[keyof typeof EntityPrefix];

/**
 * Generic retry primitive: generates a value with `generate()` until
 * `isUnique` returns true, up to `maxAttempts` times. Throws if exhausted.
 */
export async function generateUnique<T>(
  generate: () => T,
  isUnique: (value: T) => Promise<boolean>,
  maxAttempts = 10,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const value = generate();
    if (await isUnique(value)) return value;
  }
  throw new Error(`Failed to generate unique value after ${maxAttempts} attempts`);
}

/**
 * Generates a prefixed entity ID of the form `<prefix>-<uuid>`.
 * Retries until `isUnique` returns true, up to `maxAttempts` times.
 * Throws if all attempts are exhausted (astronomically unlikely with UUID v4).
 */
export function generateUniqueId(
  prefix: EntityPrefixValue,
  isUnique: (id: string) => Promise<boolean>,
  maxAttempts = 10,
): Promise<string> {
  return generateUnique(() => `${prefix}-${randomUUID()}`, isUnique, maxAttempts);
}
