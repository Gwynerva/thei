import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { AsyncZipDeflate, Zip } from 'fflate';

export interface ZipSingleFileOptions {
  onProgress?: (progress: number) => void;
}

/**
 * Compresses one file into a zip archive on disk.
 *
 * The entry is named `file.<extension>` with a fixed timestamp: the archive
 * says nothing about the uploaded file beyond its bytes, and the same bytes
 * always produce the same archive.
 *
 * Both sides stream. The source can be up to the 500 MB file limit, and the
 * previous implementation held the input buffer, a `Uint8Array` view of it,
 * every output chunk, and the concatenated result in memory at once.
 */
export async function zipFileToPath(
  sourcePath: string,
  sourceSize: number,
  extension: string,
  targetPath: string,
  options: ZipSingleFileOptions = {},
): Promise<void> {
  const entryName = zipEntryName(extension);
  const output = createWriteStream(targetPath);

  try {
    await new Promise<void>((resolve, reject) => {
      let failed = false;
      const fail = (error: unknown) => {
        if (failed) return;
        failed = true;
        reject(error);
      };

      const archive = new Zip((error, chunk, final) => {
        if (error) {
          fail(error);
          return;
        }
        if (chunk) output.write(Buffer.from(chunk));
        if (final) {
          options.onProgress?.(1);
          output.end(() => resolve());
        }
      });

      const entry = new AsyncZipDeflate(entryName, {
        level: 9,
      }) as AsyncZipDeflate & {
        ondrain?: (processedBytes: number) => void;
      };
      entry.mtime = ZIP_ENTRY_MTIME;
      entry.ondrain = (processedBytes) => {
        if (sourceSize === 0) return;
        options.onProgress?.(Math.min(processedBytes / sourceSize, 0.99));
      };

      archive.add(entry);
      options.onProgress?.(0.01);

      void (async () => {
        try {
          const source = createReadStream(sourcePath);
          for await (const chunk of source) {
            if (failed) return;
            const bytes = chunk as Buffer;
            entry.push(new Uint8Array(bytes), false);
            // fflate deflates synchronously on push, so yielding between
            // chunks keeps a large file from blocking the event loop outright.
            await nextTick();
          }
          entry.push(new Uint8Array(0), true);
          archive.end();
        } catch (error) {
          fail(error);
        }
      })();

      output.on('error', fail);
    });
  } catch (error) {
    output.destroy();
    await rm(targetPath, { force: true }).catch(() => {});
    throw error;
  }
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** The earliest time a zip entry can record. */
const ZIP_ENTRY_MTIME = new Date(1980, 0, 1);

function zipEntryName(extension: string): string {
  const safe = extension.toLowerCase().replace(/[^a-z0-9]/g, '');
  return safe ? `file.${safe}` : 'file';
}
