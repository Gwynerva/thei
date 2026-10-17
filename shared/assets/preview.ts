import type { ArchivedOriginalFileMeta } from '../asset';
import { getAssetMediaKind, normalizeAssetExtension } from './formats';

/**
 * Files that are words, whatever they hold: a person reads them in a file's
 * own window, a model in a session. Another file that turns out to be text
 * is told by its first bytes (`looksLikeText`).
 */
export const TEXT_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  'txt',
  'text',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'ndjson',
  'xml',
  'html',
  'htm',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'log',
  'ics',
  'vcf',
  'srt',
  'vtt',
  'gpx',
  'kml',
  'css',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'vue',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'ps1',
  'bat',
  'sql',
  'diff',
  'patch',
  'tex',
  'bib',
  'rst',
  'org',
]);

/**
 * How a file that is no picture, video or recording is shown in its window:
 * as text, as a rendered Markdown text, as a table, as a page of its own, in
 * the browser's PDF viewer, as the list of an archive's files — or `probe`,
 * by looking at its first bytes first.
 */
export type AssetPreviewKind =
  'text' | 'markdown' | 'table' | 'html' | 'pdf' | 'zip' | 'probe';

const KIND_OF_EXTENSION: Record<string, AssetPreviewKind> = {
  md: 'markdown',
  markdown: 'markdown',
  csv: 'table',
  tsv: 'table',
  html: 'html',
  htm: 'html',
  pdf: 'pdf',
  zip: 'zip',
};

export interface AssetPreview {
  kind: AssetPreviewKind;
  /** The extension of what is shown: the file's, or its archived original's. */
  extension: string;
  /**
   * The file is kept zipped, as the owner chose on upload: what is shown is
   * the archive's one file, the original.
   */
  archived?: ArchivedOriginalFileMeta;
}

function kindOf(extension: string): AssetPreviewKind | undefined {
  const normalized = normalizeAssetExtension(extension);
  // A picture, a video and a recording have viewers of their own.
  if (getAssetMediaKind(normalized) !== 'other') return undefined;
  return (
    KIND_OF_EXTENSION[normalized] ??
    (TEXT_FILE_EXTENSIONS.has(normalized) ? 'text' : 'probe')
  );
}

/** What a file's window can show of it, and how. */
export function assetPreview(
  extension: string,
  archivedOriginal?: ArchivedOriginalFileMeta,
): AssetPreview | undefined {
  if (archivedOriginal) {
    const kind = kindOf(archivedOriginal.extension);
    return kind
      ? {
          kind,
          extension: normalizeAssetExtension(archivedOriginal.extension),
          archived: archivedOriginal,
        }
      : undefined;
  }
  const kind = kindOf(extension);
  return kind
    ? { kind, extension: normalizeAssetExtension(extension) }
    : undefined;
}

/**
 * Whether a file is worth opening in its window rather than downloading at
 * once: its kind is known to show. A file only a look at its bytes could
 * tell is downloaded, as before.
 */
export function isAssetPreviewable(
  extension: string,
  archivedOriginal?: ArchivedOriginalFileMeta,
): boolean {
  const preview = assetPreview(extension, archivedOriginal);
  return !!preview && preview.kind !== 'probe';
}

/** How much of a text is read to show it: its first megabyte. */
export const PREVIEW_TEXT_BYTES = 1024 * 1024;
/** What is looked at to tell a text from anything else. */
export const PREVIEW_PROBE_BYTES = 4096;
/** A page or a PDF larger than this is downloaded, not drawn in the window. */
export const PREVIEW_PAGE_BYTES = 20 * 1024 * 1024;
/** A file inside an archive is opened up to this size, once unpacked. */
export const PREVIEW_ENTRY_BYTES = 50 * 1024 * 1024;
/** Rows of a table shown; the rest is in the file. */
export const PREVIEW_TABLE_ROWS = 2000;
/** Files of an archive listed; the rest are counted. */
export const PREVIEW_ARCHIVE_ROWS = 1000;

/**
 * An address in a text shown in a window, if it is one to keep: a link to
 * another site, an e-mail or a place in the same text; a picture from
 * another site or written into the text. A path relative to the file has
 * nothing to point to: a file is kept by its contents, with no folder of
 * its own around it.
 */
export function previewUrl(
  value: string,
  kind: 'link' | 'image',
): string | undefined {
  const url = value.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (kind === 'link')
    return /^mailto:/i.test(url) || url.startsWith('#') ? url : undefined;
  return /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,]/i.test(url)
    ? url
    : undefined;
}
