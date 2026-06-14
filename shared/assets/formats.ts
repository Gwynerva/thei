export const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
] as const;
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'] as const;
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac'] as const;

export type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];
export type VideoExtension = (typeof VIDEO_EXTENSIONS)[number];
export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];
export type AssetMediaKind = 'image' | 'video' | 'audio' | 'other';

const IMAGE_EXTS = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXTS = new Set<string>(VIDEO_EXTENSIONS);
const AUDIO_EXTS = new Set<string>(AUDIO_EXTENSIONS);

const ASSET_MIME_TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  zip: 'application/zip',
};

export function normalizeAssetExtension(extension: string): string {
  return extension.trim().replace(/^\./, '').toLowerCase();
}

export function getAssetMediaKind(extension: string): AssetMediaKind {
  const normalized = normalizeAssetExtension(extension);
  if (IMAGE_EXTS.has(normalized)) return 'image';
  if (VIDEO_EXTS.has(normalized)) return 'video';
  if (AUDIO_EXTS.has(normalized)) return 'audio';
  return 'other';
}

export function getAssetMimeType(extension: string): string {
  return (
    ASSET_MIME_TYPES[normalizeAssetExtension(extension)] ??
    'application/octet-stream'
  );
}

export function isAssetExtensionSafeInline(extension: string): boolean {
  const normalized = normalizeAssetExtension(extension);
  if (normalized === 'svg') return false;
  return getAssetMediaKind(normalized) !== 'other';
}
