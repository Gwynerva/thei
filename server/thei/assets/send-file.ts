import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  createError,
  getHeader,
  sendStream,
  setHeader,
  setResponseStatus,
} from 'h3';
import {
  getAssetMimeType,
  isAssetExtensionSafeInline,
  normalizeAssetExtension,
} from '../../../shared/assets/formats';

export interface AssetByteRange {
  start: number;
  end: number;
}

export interface SendAssetFileOptions {
  cacheControl: string;
  filename?: string;
  etag?: string;
}

export function parseAssetRange(
  range: string,
  size: number,
): AssetByteRange | null {
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;

  const [, startText, endText] = match;
  let start = startText ? Number(startText) : 0;
  let end = endText ? Number(endText) : size - 1;

  if (!startText && endText) {
    const suffixLength = Number(endText);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

export function buildAssetContentDisposition(
  extension: string,
  filename?: string,
): string | undefined {
  if (isAssetExtensionSafeInline(extension)) return undefined;

  const normalizedExtension = normalizeAssetExtension(extension);
  const fallback = normalizedExtension
    ? `asset.${normalizedExtension}`
    : 'asset';
  const safeFilename = (filename || fallback)
    .replace(/[\\/]/g, '_')
    .replace(/[\r\n"]/g, '_')
    .trim();

  return `attachment; filename="${safeFilename || fallback}"`;
}

export async function sendAssetFile(
  event: any,
  filePath: string,
  extension: string,
  options: SendAssetFileOptions,
) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) throw createError({ statusCode: 404 });

  const contentDisposition = buildAssetContentDisposition(
    extension,
    options.filename,
  );
  const requestedRange = getHeader(event, 'range');
  const ifRange = getHeader(event, 'if-range');
  const range =
    ifRange && ifRange !== options.etag ? undefined : requestedRange;

  setHeader(event, 'Content-Type', getAssetMimeType(extension));
  setHeader(event, 'X-Content-Type-Options', 'nosniff');
  setHeader(event, 'Cache-Control', options.cacheControl);
  setHeader(event, 'Accept-Ranges', 'bytes');
  if (options.etag) {
    setHeader(event, 'ETag', options.etag);
    const validators = getHeader(event, 'if-none-match')
      ?.split(',')
      .map((value) => value.trim().replace(/^W\//, ''));
    if (validators?.some((value) => value === '*' || value === options.etag)) {
      setResponseStatus(event, 304);
      return null;
    }
  }
  if (contentDisposition) {
    setHeader(event, 'Content-Disposition', contentDisposition);
  }

  if (range) {
    const parsedRange = parseAssetRange(range, fileStat.size);
    if (!parsedRange) {
      setHeader(event, 'Content-Range', `bytes */${fileStat.size}`);
      throw createError({ statusCode: 416 });
    }

    const { start, end } = parsedRange;
    setResponseStatus(event, 206);
    setHeader(event, 'Content-Range', `bytes ${start}-${end}/${fileStat.size}`);
    setHeader(event, 'Content-Length', end - start + 1);
    return sendStream(event, createReadStream(filePath, { start, end }));
  }

  setHeader(event, 'Content-Length', fileStat.size);
  return sendStream(event, createReadStream(filePath));
}
