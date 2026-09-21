import { normalizeUrlSegment } from './language/slugify';

export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;

/**
 * The readable half of an entity address. It is optional and free-form, but it
 * still lands in a URL, so it is cleaned of everything a URL cannot carry.
 */
export function normalizeHumanReadableSlug(value: unknown): string {
  return normalizeUrlSegment(value);
}

export function normalizePublicId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function publicIdIsValid(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_ID_PATTERN.test(value);
}
