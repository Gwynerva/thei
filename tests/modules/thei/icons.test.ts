import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModuleNode, ViteDevServer } from 'vite';
import {
  buildIconsData,
  debounceIconsRebuild,
  invalidateIconsModule,
  refreshIconsInDev,
} from '../../../modules/thei/icons';

const temporaryDirectories: string[] = [];

async function createIconsDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'thei-icons-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeIcon(
  directory: string,
  name: string,
  body = '<path d="M0 0h1v1z"/>',
  viewBox = '0 0 24 24',
) {
  await writeFile(
    join(directory, `${name}.svg`),
    `<svg viewBox="${viewBox}">${body}</svg>`,
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('bundled icons data', () => {
  it('registers the project action click icon from the application bundle', async () => {
    const icons = await buildIconsData(
      join(process.cwd(), 'app', 'assets', 'icons'),
    );
    expect(icons.iconNames).toContain('action-click');
    expect(icons.iconsSvg).toContain('<symbol id="action-click"');
    expect(icons.iconNames).toEqual(
      expect.arrayContaining([
        'asterisk',
        'bold',
        'italic',
        'heading',
        'subheading',
        'quote',
        'media',
        'gallery',
        'media-as-is',
        'media-centered',
        'media-stretch',
        'list-unordered',
        'link-broken',
        'history',
      ]),
    );
  });

  it('changes the manifest, hash, and sprite when an icon is added', async () => {
    const directory = await createIconsDirectory();
    await writeIcon(directory, 'alpha');
    const before = await buildIconsData(directory);

    await writeIcon(directory, 'beta');
    const after = await buildIconsData(directory);

    expect(after.iconNames).toEqual(['alpha', 'beta']);
    expect(after.iconsHash).not.toBe(before.iconsHash);
    expect(after.iconsSvg).toContain('<symbol id="beta"');
  });

  it('removes a deleted icon and changes the hash', async () => {
    const directory = await createIconsDirectory();
    await writeIcon(directory, 'alpha');
    await writeIcon(directory, 'beta');
    const before = await buildIconsData(directory);

    await rm(join(directory, 'beta.svg'));
    const after = await buildIconsData(directory);

    expect(after.iconNames).toEqual(['alpha']);
    expect(after.iconsHash).not.toBe(before.iconsHash);
    expect(after.iconsSvg).not.toContain('<symbol id="beta"');
  });

  it('changes the hash and symbol when icon content is updated', async () => {
    const directory = await createIconsDirectory();
    await writeIcon(directory, 'alpha');
    const before = await buildIconsData(directory);

    await writeIcon(
      directory,
      'alpha',
      '<circle cx="8" cy="8" r="8"/>',
      '0 0 16 16',
    );
    const after = await buildIconsData(directory);

    expect(after.iconsHash).not.toBe(before.iconsHash);
    expect(after.iconsSvg).toContain('<symbol id="alpha" viewBox="0 0 16 16">');
    expect(after.iconsSvg).toContain('<circle cx="8" cy="8" r="8"/>');
  });

  it('changes the hash when an unchanged icon is renamed', async () => {
    const directory = await createIconsDirectory();
    await writeIcon(directory, 'alpha');
    const before = await buildIconsData(directory);

    const content = '<svg viewBox="0 0 24 24"><path d="M0 0h1v1z"/></svg>';
    await rm(join(directory, 'alpha.svg'));
    await writeFile(join(directory, 'beta.svg'), content);
    const after = await buildIconsData(directory);

    expect(after.iconNames).toEqual(['beta']);
    expect(after.iconsHash).not.toBe(before.iconsHash);
  });
});

describe('Vite icon module invalidation', () => {
  it('invalidates generated file and Nuxt virtual module variants', () => {
    const fileModule = {
      id: '/@fs/C:/project/.nuxt/thei/icons.ts',
    } as ModuleNode;
    const virtualModule = {
      id: 'virtual:nuxt:.nuxt%2Fthei%2Ficons.ts',
    } as ModuleNode;
    const invalidateModule = vi.fn();
    const getModulesByFile = vi.fn((id: string) =>
      id === 'C:/project/.nuxt/thei/icons.ts'
        ? new Set([fileModule])
        : undefined,
    );
    const viteServer = {
      moduleGraph: {
        getModulesByFile,
        idToModuleMap: new Map([
          [fileModule.id!, fileModule],
          [virtualModule.id!, virtualModule],
        ]),
        invalidateModule,
      },
    } as unknown as ViteDevServer;

    invalidateIconsModule(viteServer, 'C:\\project\\.nuxt\\thei\\icons.ts');

    expect(invalidateModule).toHaveBeenCalledTimes(2);
    expect(invalidateModule).toHaveBeenCalledWith(fileModule);
    expect(invalidateModule).toHaveBeenCalledWith(virtualModule);
  });

  it('regenerates, invalidates every graph, then reloads only the client', async () => {
    const events: string[] = [];
    const moduleNode = { id: 'virtual:nuxt:.nuxt%2Fthei%2Ficons.ts' };
    const createServer = (name: string) =>
      ({
        moduleGraph: {
          getModulesByFile: () => undefined,
          idToModuleMap: new Map([[moduleNode.id, moduleNode]]),
          invalidateModule: () => events.push(`invalidate:${name}`),
        },
        ws: {
          send: () => events.push(`reload:${name}`),
        },
      }) as unknown as ViteDevServer;

    await refreshIconsInDev(
      async () => {
        events.push('regenerate');
      },
      [
        { viteServer: createServer('client'), isClient: true },
        { viteServer: createServer('server'), isClient: false },
      ],
      'E:\\project\\.nuxt\\thei\\icons.ts',
    );

    expect(events).toEqual([
      'regenerate',
      'invalidate:client',
      'invalidate:server',
      'reload:client',
    ]);
  });

  it('debounces a burst of icon filesystem events into one rebuild', async () => {
    vi.useFakeTimers();
    const rebuild = vi.fn(async () => {});
    const debouncedRebuild = debounceIconsRebuild(rebuild, 20);

    void debouncedRebuild();
    void debouncedRebuild();
    void debouncedRebuild();
    await vi.advanceTimersByTimeAsync(20);

    expect(rebuild).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
