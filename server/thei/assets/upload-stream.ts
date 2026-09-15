import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { H3Event } from 'h3';
import { theiTempPath } from './temp';

/** An upload staged on disk, never held whole in memory. */
export interface StagedUpload {
  /** Path to the staged bytes. Valid until `discard()` is called. */
  path: string;
  size: number;
  /** SHA-256 of the staged bytes, computed while they were being written. */
  hash: string;
  discard: () => Promise<void>;
}

/**
 * Streams the request body to a temp file, hashing it in the same pass.
 *
 * The body used to be read with `readMultipartFormData`, which holds the whole
 * request in memory. With a 500 MB file limit against the 2 GB the installer
 * asks for, one large upload was already close to the edge and two concurrent
 * ones took the process down — into a restart loop, because the systemd unit
 * sets `Restart=always` with `OOMPolicy=continue`.
 *
 * Metadata travels in headers so the body can stay a raw byte stream, which is
 * also why there is nothing to parse before the first byte is written.
 */
export async function stageUploadBody(
  event: H3Event,
  options: { maxSizeBytes: number },
): Promise<StagedUpload> {
  const path = theiTempPath(`upload-${randomUUID()}`);
  const digest = createHash('sha256');
  let size = 0;
  let tooLarge = false;

  const discard = async () => {
    await rm(path, { force: true }).catch(() => {});
  };

  try {
    await pipeline(
      event.node.req,
      async function* (source) {
        for await (const chunk of source) {
          const bytes = chunk as Buffer;
          size += bytes.length;
          if (size > options.maxSizeBytes) {
            // Stop reading rather than draining the rest of a file that is
            // already known to be rejected.
            tooLarge = true;
            return;
          }
          digest.update(bytes);
          yield bytes;
        }
      },
      createWriteStream(path),
    );
  } catch (error) {
    await discard();
    throw error;
  }

  if (tooLarge) {
    await discard();
    throw createError({
      statusCode: 413,
      message: 'File exceeds the maximum allowed size',
    });
  }

  if (size === 0) {
    await discard();
    throw createError({ statusCode: 400, message: 'Empty upload' });
  }

  return { path, size, hash: digest.digest('hex'), discard };
}

/**
 * Reads an upload header.
 *
 * Values are percent-encoded by the client because headers are latin-1 and a
 * filename is not.
 */
export function readUploadHeader(
  event: H3Event,
  name: string,
  required = true,
): string {
  const raw = getHeader(event, name);
  if (!raw) {
    if (!required) return '';
    throw createError({
      statusCode: 400,
      message: `Missing required field: ${name}`,
    });
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    throw createError({ statusCode: 400, message: `Invalid header: ${name}` });
  }
}
