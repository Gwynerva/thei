export function buildProjectUrl(
  humanReadable: string,
  publicId: string,
): string {
  const pathPart = humanReadable ? `${humanReadable}-${publicId}` : publicId;
  return `/projects/${pathPart}/`;
}

/** Extracts the ID portion while deliberately ignoring the readable prefix. */
export function publicIdFromProjectUrlPart(value: string): string {
  return value.slice(value.lastIndexOf('-') + 1);
}

export function isPublicId(value: string): boolean {
  return /^[A-Za-z0-9]{1,64}$/.test(value);
}
