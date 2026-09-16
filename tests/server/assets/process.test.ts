import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { processOriginalAsset } from '../../../server/thei/assets/process';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-process-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function stage(bytes: string, extension: string) {
  const path = join(directory, `source.${extension}`);
  const buffer = Buffer.from(bytes);
  await writeFile(path, buffer);
  return {
    path,
    size: buffer.length,
    hash: createHash('sha256').update(buffer).digest('hex'),
    extension,
    owned: true,
  };
}

describe('original asset content validation', () => {
  it('rejects invalid image content even when the extension looks like an image', async () => {
    await expect(
      processOriginalAsset(await stage('not an image', 'png')),
    ).rejects.toThrow('Invalid image file');
  });

  it('rejects invalid video content even when the extension looks like a video', async () => {
    await expect(
      processOriginalAsset(await stage('not a video', 'mp4')),
    ).rejects.toThrow('Invalid video file');
  });

  it('hands the staged file through without reading it into memory', async () => {
    const source = await stage('arbitrary bytes', 'bin');
    const processed = await processOriginalAsset(source);

    // An untransformed upload is stored by moving the file that is already on
    // disk, so the bytes must never become a buffer on the way there.
    expect(processed.bytes).toEqual({
      path: source.path,
      size: source.size,
      hash: source.hash,
      owned: true,
    });
    expect(processed.bytes.buffer).toBeUndefined();
  });
});
