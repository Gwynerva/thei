import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { zipFileToPath } from '../../../server/thei/assets/zip';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-zip-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function zip(
  input: Buffer,
  extension: string,
  onProgress?: (value: number) => void,
) {
  const sourcePath = join(directory, 'source.bin');
  const targetPath = join(directory, 'archive.zip');
  await writeFile(sourcePath, input);
  await zipFileToPath(sourcePath, input.length, extension, targetPath, {
    ...(onProgress ? { onProgress } : {}),
  });
  return { archive: await readFile(targetPath), targetPath };
}

describe('zipFileToPath', () => {
  it('creates a valid single-file zip archive', async () => {
    const input = Buffer.from('hello from thei');
    const { archive } = await zip(input, 'txt');

    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
    expect(Buffer.from(unzipSync(archive)['file.txt']!)).toEqual(input);
  });

  it('names the entry by extension only and reports progress', async () => {
    const input = Buffer.from('hello from thei'.repeat(1000));
    const progress: number[] = [];
    const { archive } = await zip(input, 'TXT', (value) =>
      progress.push(value),
    );

    const files = unzipSync(archive);
    expect(Object.keys(files)).toEqual(['file.txt']);
    expect(Buffer.from(files['file.txt']!)).toEqual(input);
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(1);
  });

  it('produces identical archives for identical bytes', async () => {
    const input = Buffer.from('payload');
    const first = (await zip(input, 'pdf')).archive;
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const second = (await zip(input, '../pdf')).archive;

    expect(second.equals(first)).toBe(true);
  });

  it('leaves no archive behind when the source cannot be read', async () => {
    const targetPath = join(directory, 'archive.zip');
    await expect(
      zipFileToPath(join(directory, 'missing.bin'), 10, 'txt', targetPath),
    ).rejects.toThrow();
    await expect(stat(targetPath)).rejects.toThrow();
  });
});
