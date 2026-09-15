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
  filename: string,
  onProgress?: (value: number) => void,
) {
  const sourcePath = join(directory, 'source.bin');
  const targetPath = join(directory, 'archive.zip');
  await writeFile(sourcePath, input);
  await zipFileToPath(sourcePath, input.length, filename, targetPath, {
    ...(onProgress ? { onProgress } : {}),
  });
  return { archive: await readFile(targetPath), targetPath };
}

describe('zipFileToPath', () => {
  it('creates a valid single-file zip archive', async () => {
    const input = Buffer.from('hello from thei');
    const { archive } = await zip(input, 'notes.txt');

    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
    expect(Buffer.from(unzipSync(archive)['notes.txt']!)).toEqual(input);
  });

  it('keeps the original filename and reports progress', async () => {
    const input = Buffer.from('hello from thei'.repeat(1000));
    const progress: number[] = [];
    const { archive } = await zip(input, 'notes.txt', (value) =>
      progress.push(value),
    );

    const files = unzipSync(archive);
    expect(Buffer.from(files['notes.txt']!)).toEqual(input);
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(1);
  });

  it('sanitizes a path-like entry name', async () => {
    const input = Buffer.from('payload');
    const { archive } = await zip(input, '../../etc/passwd');

    expect(Object.keys(unzipSync(archive))).toEqual(['passwd']);
  });

  it('leaves no archive behind when the source cannot be read', async () => {
    const targetPath = join(directory, 'archive.zip');
    await expect(
      zipFileToPath(join(directory, 'missing.bin'), 10, 'x.txt', targetPath),
    ).rejects.toThrow();
    await expect(stat(targetPath)).rejects.toThrow();
  });
});
