import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipFileToPath } from '../../../server/thei/assets/zip';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-zip-abort-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('zipping a file for a request that goes away', () => {
  it('stops, rejects with the reason and leaves no archive behind', async () => {
    const source = join(root, 'source.bin');
    // Enough chunks for the loop to yield between them.
    await writeFile(source, Buffer.alloc(6 * 1024 * 1024, 7));
    const target = join(root, 'out.zip');
    const controller = new AbortController();

    const zipped = zipFileToPath(source, 6 * 1024 * 1024, 'bin', target, {
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress > 0.01) controller.abort(new Error('closed'));
      },
    });

    await expect(zipped).rejects.toThrow('closed');
    await expect(stat(target)).rejects.toThrow();
  });

  it('refuses a request that is already gone', async () => {
    const controller = new AbortController();
    controller.abort(new Error('gone'));
    await expect(
      zipFileToPath(join(root, 'none'), 0, 'bin', join(root, 'out.zip'), {
        signal: controller.signal,
      }),
    ).rejects.toThrow('gone');
  });
});
