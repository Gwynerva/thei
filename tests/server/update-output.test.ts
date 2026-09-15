import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retargetSymlinks, swapOutput } from '../../update/output';

let directory: string;

/**
 * Mirrors what Nitro produces: a build tree that links duplicate dependency
 * versions through absolute paths into its own `.nitro` directory.
 */
async function buildStaging(root: string, name: string) {
  const staging = join(root, name);
  const nitro = join(staging, 'server/node_modules/.nitro/entities@7.0.1');

  await mkdir(nitro, { recursive: true });
  await writeFile(join(nitro, 'package.json'), '{"version":"7.0.1"}');
  await mkdir(join(staging, 'server/node_modules/parse5'), {
    recursive: true,
  });
  await writeFile(join(staging, 'server/index.mjs'), 'export default 1;\n');

  await symlink(
    nitro,
    join(staging, 'server/node_modules/entities'),
    'junction',
  );
  await symlink(
    nitro,
    join(staging, 'server/node_modules/parse5/entities'),
    'junction',
  );

  return staging;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-output-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('build swap', () => {
  it('moves a staged build into place and keeps the old one', async () => {
    const previousOutput = join(directory, '.output');
    await mkdir(join(previousOutput, 'server'), { recursive: true });
    await writeFile(join(previousOutput, 'server/index.mjs'), 'old\n');

    const staging = await buildStaging(directory, '.output.next');
    const result = await swapOutput(directory, staging);

    expect(existsSync(staging)).toBe(false);
    expect(
      readFileSync(join(directory, '.output.prev/server/index.mjs'), 'utf8'),
    ).toBe('old\n');
    expect(result.retargeted).toBe(2);
  });

  it('leaves no link pointing at the staging directory', async () => {
    const staging = await buildStaging(directory, '.output.next');
    await swapOutput(directory, staging);

    const linked = join(directory, '.output/server/node_modules/entities');
    const target = (await readlink(linked)).replace(/\\/g, '/');

    expect(target).not.toContain('.output.next');
    expect(target).toContain('.output/server/node_modules/.nitro');
    // The whole point: the package is reachable again.
    expect(
      JSON.parse(readFileSync(join(linked, 'package.json'), 'utf8')),
    ).toEqual({ version: '7.0.1' });
  });

  it('works when there is no previous build', async () => {
    const staging = await buildStaging(directory, '.output.next');
    await expect(swapOutput(directory, staging)).resolves.toBeDefined();
    expect(existsSync(join(directory, '.output/server/index.mjs'))).toBe(true);
  });

  it('leaves unrelated links alone', async () => {
    const outside = join(directory, 'outside');
    await mkdir(outside, { recursive: true });

    const staging = await buildStaging(directory, '.output.next');
    await symlink(outside, join(staging, 'server/other'), 'junction');

    await swapOutput(directory, staging);

    const target = (
      await readlink(join(directory, '.output/server/other'))
    ).replace(/\\/g, '/');
    expect(target).toContain('/outside');
  });

  it('reports nothing to do when no link needs repointing', async () => {
    const root = join(directory, 'plain');
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'file.txt'), 'x');

    expect(await retargetSymlinks(root, '/nowhere', '/elsewhere')).toBe(0);
  });
});
