import {
  PREVIEW_ENTRY_BYTES,
  PREVIEW_PAGE_BYTES,
  PREVIEW_PROBE_BYTES,
  PREVIEW_TABLE_ROWS,
  PREVIEW_TEXT_BYTES,
  type AssetPreview,
} from '#layers/thei/shared/assets/preview';
import { detectCsvDelimiter, parseCsv } from '#layers/thei/shared/csv';
import {
  cutAtLastLine,
  decodeText,
  looksLikeText,
} from '#layers/thei/shared/text-bytes';
import {
  readZipDirectory,
  ZipReadError,
  type ByteSource,
  type ZipDirectory,
} from '#layers/thei/shared/zip-directory';
import { blobByteSource } from './source';
import { readZipEntry } from './zip';

export type FilePreviewView =
  | { view: 'none' }
  /** The start of a text: `shown` bytes of `total`. */
  | { view: 'text'; text: string; shown: number; total: number }
  | { view: 'markdown'; text: string }
  /** The first row is the head; `more` when the file goes on. */
  | { view: 'table'; rows: string[][]; more: boolean }
  | { view: 'page'; html: string }
  | { view: 'pdf'; url: string; revoke?: () => void }
  | { view: 'zip'; directory: ZipDirectory; source: ByteSource }
  | { view: 'error'; reason: 'large' | 'failed' | 'no-pdf' };

export interface FilePreviewOptions {
  /** An address the browser's PDF viewer opens itself, a part at a time. */
  pdfUrl?: string;
  /** The file itself, when it is at hand: shown without a copy of it. */
  file?: Blob;
}

/**
 * The most of an archived original that is unpacked to show it: what its
 * kind reads at all. A text is shown by its start, a page whole.
 */
function shownBytes(preview: AssetPreview): number {
  switch (preview.kind) {
    case 'probe':
    case 'text':
    case 'markdown':
    case 'table':
      return PREVIEW_TEXT_BYTES;
    case 'html':
    case 'pdf':
      return PREVIEW_PAGE_BYTES;
    case 'zip':
      return PREVIEW_ENTRY_BYTES;
  }
}

/**
 * What was unpacked of a file, which may be only its start: it reads as the
 * whole file's size, so a text says how much of it is shown.
 */
function unpackedSource(bytes: Uint8Array<ArrayBuffer>, size: number) {
  const source = blobByteSource(new Blob([bytes]));
  return {
    size: Math.max(size, bytes.length),
    read: (start: number, end: number) =>
      source.read(start, Math.min(end, bytes.length)),
  } satisfies ByteSource;
}

async function textHead(source: ByteSource) {
  const shown = Math.min(source.size, PREVIEW_TEXT_BYTES);
  const partial = shown < source.size;
  const text = decodeText(await source.read(0, shown), partial);
  return { text: partial ? cutAtLastLine(text) : text, shown, partial };
}

async function asText(source: ByteSource): Promise<FilePreviewView> {
  const { text, shown } = await textHead(source);
  return { view: 'text', text, shown, total: source.size };
}

async function show(
  preview: AssetPreview,
  source: ByteSource,
  options: FilePreviewOptions,
): Promise<FilePreviewView> {
  switch (preview.kind) {
    case 'probe': {
      const head = await source.read(
        0,
        Math.min(source.size, PREVIEW_PROBE_BYTES),
      );
      return looksLikeText(head) ? asText(source) : { view: 'none' };
    }
    case 'text':
      return asText(source);
    case 'markdown': {
      if (source.size > PREVIEW_TEXT_BYTES) return asText(source);
      const bytes = await source.read(0, source.size);
      return { view: 'markdown', text: decodeText(bytes) };
    }
    case 'table': {
      const { text, shown, partial } = await textHead(source);
      const { rows, more } = parseCsv(
        text,
        detectCsvDelimiter(text, preview.extension === 'tsv' ? '	' : ','),
        PREVIEW_TABLE_ROWS + 1,
      );
      // One column is no table: it reads better as lines.
      if (rows.every((row) => row.length < 2))
        return { view: 'text', text, shown, total: source.size };
      return { view: 'table', rows, more: more || partial };
    }
    case 'html': {
      if (source.size > PREVIEW_PAGE_BYTES)
        return { view: 'error', reason: 'large' };
      const bytes = await source.read(0, source.size);
      return { view: 'page', html: decodeText(bytes) };
    }
    case 'pdf': {
      if (
        typeof navigator !== 'undefined' &&
        navigator.pdfViewerEnabled === false
      )
        return { view: 'error', reason: 'no-pdf' };
      if (options.pdfUrl) return { view: 'pdf', url: options.pdfUrl };
      if (source.size > PREVIEW_PAGE_BYTES)
        return { view: 'error', reason: 'large' };
      const blob =
        options.file?.type === 'application/pdf'
          ? options.file
          : new Blob([await source.read(0, source.size)], {
              type: 'application/pdf',
            });
      const url = URL.createObjectURL(blob);
      return { view: 'pdf', url, revoke: () => URL.revokeObjectURL(url) };
    }
    case 'zip':
      return { view: 'zip', directory: await readZipDirectory(source), source };
  }
}

/**
 * How a file is shown in its window, read from `source` a piece at a time.
 * A file kept zipped is first taken out of its archive: the original is what
 * is shown.
 */
export async function loadFilePreview(
  preview: AssetPreview,
  source: ByteSource,
  options: FilePreviewOptions = {},
): Promise<FilePreviewView> {
  try {
    if (preview.archived) {
      const { entries } = await readZipDirectory(source);
      const original = entries.find((entry) => !entry.directory);
      if (!original) return { view: 'error', reason: 'failed' };
      // Only as much is unpacked as the kind shows: the start of a long
      // text, a page no larger than a page may be.
      const limit = shownBytes(preview);
      const text = limit === PREVIEW_TEXT_BYTES;
      if (!text && original.size > limit)
        return { view: 'error', reason: 'large' };
      const bytes = await readZipEntry(source, original, limit, { head: text });
      return await show(preview, unpackedSource(bytes, original.size), {});
    }
    return await show(preview, source, options);
  } catch (reason) {
    return {
      view: 'error',
      reason:
        reason instanceof ZipReadError && reason.reason === 'too-large'
          ? 'large'
          : 'failed',
    };
  }
}
