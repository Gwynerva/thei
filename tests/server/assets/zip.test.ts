import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { zipSingleFile } from '../../../server/thei/assets/zip';

describe('zipSingleFile', () => {
  it('creates a valid single-file zip archive', async () => {
    const input = Buffer.from('hello from thei');
    const archive = await zipSingleFile(input, 'notes.txt');

    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
    expect(Buffer.from(unzipSync(archive)['notes.txt']!)).toEqual(input);
  });

  it('keeps the original filename and reports progress', async () => {
    const input = Buffer.from('hello from thei'.repeat(1000));
    const progress: number[] = [];
    const archive = await zipSingleFile(input, 'notes.txt', {
      onProgress: (value) => progress.push(value),
    });

    const files = unzipSync(archive);
    expect(Buffer.from(files['notes.txt']!)).toEqual(input);
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(1);
  });
});
