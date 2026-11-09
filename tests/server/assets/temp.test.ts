import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { wipeTheiDir } from '../../../server/thei/assets/temp';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-temp-'));
  (globalThis as any).THEI_SERVER = {
    projectPath: (...parts: string[]) => join(root, ...parts),
  };
});

afterEach(async () => {
  delete (globalThis as any).THEI_SERVER;
  await rm(root, { recursive: true, force: true });
});

describe('wiping .thei for a fresh installation', () => {
  it('takes the scratch and keeps the tools', async () => {
    const thei = join(root, '.thei');
    await mkdir(join(thei, 'tmp'), { recursive: true });
    await mkdir(join(thei, 'bin', 'ffmpeg', '9.0.2'), { recursive: true });
    await writeFile(join(thei, 'tmp', 'upload-1'), 'scratch');
    await writeFile(join(thei, 'search.db'), 'index');
    await writeFile(join(thei, 'backup-state.json'), '{}');
    await writeFile(join(thei, 'bin', 'ffmpeg', '9.0.2', 'ffmpeg'), 'tool');

    await wipeTheiDir();

    expect(existsSync(join(thei, 'tmp'))).toBe(false);
    expect(existsSync(join(thei, 'search.db'))).toBe(false);
    expect(existsSync(join(thei, 'backup-state.json'))).toBe(false);
    expect(existsSync(join(thei, 'bin', 'ffmpeg', '9.0.2', 'ffmpeg'))).toBe(
      true,
    );
  });

  it('is fine with no .thei at all', async () => {
    await expect(wipeTheiDir()).resolves.toBeUndefined();
  });
});
