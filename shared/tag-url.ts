export function buildTagUrl(slug: string, publicId: string): string {
  return `/tags/${slug ? `${slug}-` : ''}${publicId}/`;
}

export function publicIdFromTagUrlPart(value: string): string {
  return value.slice(value.lastIndexOf('-') + 1);
}
