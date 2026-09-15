import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

/**
 * The bytes of an asset, either already in memory or staged on disk.
 *
 * Small derived outputs (an encoded image, a preview thumbnail) are naturally
 * buffers. Anything that arrived from the network or came out of ffmpeg is a
 * file and must never be read into memory just to be written back out: those
 * are the cases where the file can be hundreds of megabytes.
 */
export type AssetBytes =
  | { buffer: Buffer; path?: undefined }
  | {
      path: string;
      size: number;
      hash: string;
      /**
       * Whether storage may consume this file.
       *
       * True for scratch — a staged upload, an ffmpeg output — which storage
       * moves into the library or deletes if it turns out to be redundant.
       * False for a file that belongs to someone else, above all a file that
       * is already in the library: re-deriving a variant from a stored asset
       * passes its real path, and moving or deleting that would destroy it.
       */
      owned: boolean;
      buffer?: undefined;
    };

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Digests a file in one streaming pass, without holding it in memory. */
export async function hashFile(
  path: string,
): Promise<{ hash: string; size: number }> {
  const digest = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Buffer;
    size += bytes.length;
    digest.update(bytes);
  }
  return { hash: digest.digest('hex'), size };
}

export async function fileBytes(
  path: string,
  owned = true,
): Promise<AssetBytes> {
  const { hash, size } = await hashFile(path);
  return { path, hash, size, owned };
}

export function assetBytesSize(bytes: AssetBytes): number {
  return bytes.buffer ? bytes.buffer.length : bytes.size;
}

export function assetBytesHash(bytes: AssetBytes): string {
  return bytes.buffer ? sha256(bytes.buffer) : bytes.hash;
}

/** Reads staged bytes into memory. Only for inputs known to be small. */
export async function readAssetBytes(bytes: AssetBytes): Promise<Buffer> {
  if (bytes.buffer) return bytes.buffer;
  const { readFile } = await import('node:fs/promises');
  return await readFile(bytes.path);
}

export async function assetBytesExist(bytes: AssetBytes): Promise<boolean> {
  if (bytes.buffer) return true;
  return await stat(bytes.path).then(
    (entry) => entry.isFile(),
    () => false,
  );
}
