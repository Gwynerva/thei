export const CONTENT_MEDIA_AUTOPLAY_MAX_BYTES = 30 * 1024 * 1024;

export function contentMediaAutoplays(size: number | undefined): boolean {
  return typeof size === 'number' && size <= CONTENT_MEDIA_AUTOPLAY_MAX_BYTES;
}
