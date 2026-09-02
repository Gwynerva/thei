export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;

export function normalizeHumanReadableSlug(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePublicId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function publicIdIsValid(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_ID_PATTERN.test(value);
}
