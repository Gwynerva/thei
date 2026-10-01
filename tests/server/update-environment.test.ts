import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nativeBuildEnv } from '../../update/environment';

describe('native builds during an install', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'thei-native-build-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('points node-gyp at the headers of the Node that runs the site', async () => {
    await mkdir(join(root, 'bin'));
    await mkdir(join(root, 'include', 'node'), { recursive: true });
    await writeFile(join(root, 'include', 'node', 'node.h'), '');
    expect(nativeBuildEnv(join(root, 'bin', 'node'))).toEqual({
      npm_config_nodedir: root,
    });
  });

  it('leaves node-gyp to download them when the runtime has none', () => {
    // Bun, or a Node installed without its headers.
    expect(nativeBuildEnv(join(root, 'bin', 'bun'))).toEqual({});
  });
});
