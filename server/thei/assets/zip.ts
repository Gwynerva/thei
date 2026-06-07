import { AsyncZipDeflate, Zip } from 'fflate';

export interface ZipSingleFileOptions {
  onProgress?: (progress: number) => void;
}

export async function zipSingleFile(
  buffer: Buffer,
  filename: string,
  options: ZipSingleFileOptions = {},
): Promise<Buffer> {
  const entryName = sanitizeZipEntryName(filename);
  const source = new Uint8Array(buffer);
  const chunks: Buffer[] = [];

  return await new Promise<Buffer>((resolve, reject) => {
    const archive = new Zip((error, chunk, final) => {
      if (error) {
        reject(error);
        return;
      }

      if (chunk) chunks.push(Buffer.from(chunk));
      if (final) {
        options.onProgress?.(1);
        resolve(Buffer.concat(chunks));
      }
    });

    const file = new AsyncZipDeflate(entryName, { level: 9 });
    file.ondrain = (processedBytes) => {
      if (source.length === 0) return;
      options.onProgress?.(Math.min(processedBytes / source.length, 0.99));
    };

    archive.add(file);
    options.onProgress?.(0.01);
    file.push(source, true);
    archive.end();
  });
}

function sanitizeZipEntryName(filename: string): string {
  const basename = filename.split(/[\\/]/).pop()?.trim() || 'file';
  return basename.replace(/[<>:"|?*\x00-\x1f]/g, '_') || 'file';
}
