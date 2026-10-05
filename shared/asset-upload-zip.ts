import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  normalizeAssetExtension,
  VIDEO_EXTENSIONS,
} from './assets/formats';

const ZIP_EXCLUDED_EXTENSIONS = new Set<string>([
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'xz',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  // Media is compressed already, and a library plays or shows it as it is.
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
]);

export function canZipAssetExtension(extension: string): boolean {
  const normalized = normalizeAssetExtension(extension);
  return normalized.length > 0 && !ZIP_EXCLUDED_EXTENSIONS.has(normalized);
}
