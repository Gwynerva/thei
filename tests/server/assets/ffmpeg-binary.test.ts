import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FFMPEG_BUILDS,
  FFMPEG_VERSION,
  ffmpegBuildFor,
  ffmpegToolsDir,
  ffmpegToolsIn,
  resolveFfmpegTools,
} from '../../../update/ffmpeg/tools';
import {
  ensureFfmpeg,
  FfmpegInstallError,
  removeOtherFfmpegVersions,
  toolVersion,
  type EnsureFfmpegOptions,
} from '../../../update/ffmpeg/install';
import { prepareTestFfmpeg } from '../../setup/ffmpeg';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-ffmpeg-binary-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the pinned ffmpeg build', () => {
  it('names a build for every platform an instance runs on, pinned by hash', () => {
    const targets = FFMPEG_BUILDS.map((build) => build.target);
    expect(targets).toEqual(
      expect.arrayContaining(['linux-x64', 'linux-arm64', 'win32-x64']),
    );
    for (const build of FFMPEG_BUILDS) {
      expect(build.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(build.url).toMatch(
        /^https:\/\/github\.com\/BtbN\/FFmpeg-Builds\/releases\/download\/autobuild-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\//,
      );
      expect(build.url.endsWith(build.archive)).toBe(true);
      // The archive unpacks into a directory of its own name.
      expect(build.archive.startsWith(build.root)).toBe(true);
      expect(build.root).toMatch(/^ffmpeg-n9\.0/);
    }
    expect(ffmpegBuildFor('linux', 'x64')?.archive).toContain('linux64');
    expect(ffmpegBuildFor('linux', 'arm64')?.archive).toContain('linuxarm64');
    expect(ffmpegBuildFor('win32', 'x64')?.archive).toMatch(/win64.*\.zip$/);
    expect(ffmpegBuildFor('darwin', 'arm64')).toBeUndefined();
  });

  it('keeps each instance version in a directory of its own', () => {
    expect(ffmpegToolsDir('/srv/thei')).toBe(
      join('/srv/thei', '.thei', 'bin', 'ffmpeg', FFMPEG_VERSION),
    );
    expect(ffmpegToolsIn('/x', 'linux')).toEqual({
      ffmpeg: join('/x', 'ffmpeg'),
      ffprobe: join('/x', 'ffprobe'),
    });
    expect(ffmpegToolsIn('/x', 'win32')).toEqual({
      ffmpeg: join('/x', 'ffmpeg.exe'),
      ffprobe: join('/x', 'ffprobe.exe'),
    });
  });
});

describe('finding the tools', () => {
  async function place(base: string) {
    const tools = ffmpegToolsIn(ffmpegToolsDir(base));
    await mkdir(ffmpegToolsDir(base), { recursive: true });
    await writeFile(tools.ffmpeg, '');
    await writeFile(tools.ffprobe, '');
    return tools;
  }

  it('takes the environment first, the ffprobe beside it by default', () => {
    const env = { THEI_FFMPEG: join(root, 'own', 'ffmpeg') };
    expect(resolveFfmpegTools({ env, cwd: root, platform: 'linux' })).toEqual({
      ffmpeg: join(root, 'own', 'ffmpeg'),
      ffprobe: join(root, 'own', 'ffprobe'),
      source: 'env',
    });
    expect(
      resolveFfmpegTools({
        env: { ...env, THEI_FFPROBE: '/usr/bin/ffprobe' },
        cwd: root,
      }).ffprobe,
    ).toBe('/usr/bin/ffprobe');
  });

  it('prefers the instance to the working directory, and says when neither has them', async () => {
    const instance = join(root, 'instance');
    const cwd = join(root, 'repo');
    const inCwd = await place(cwd);
    expect(resolveFfmpegTools({ env: {}, projectPath: instance, cwd })).toEqual(
      { ...inCwd, source: 'cwd' },
    );
    const inInstance = await place(instance);
    expect(resolveFfmpegTools({ env: {}, projectPath: instance, cwd })).toEqual(
      { ...inInstance, source: 'instance' },
    );
    const nowhere = join(root, 'nowhere');
    expect(
      resolveFfmpegTools({ env: {}, projectPath: nowhere, cwd: nowhere }),
    ).toEqual({
      ...ffmpegToolsIn(ffmpegToolsDir(nowhere)),
      source: 'missing',
    });
  });
});

describe('older versions', () => {
  const parent = () => join(root, '.thei', 'bin', 'ffmpeg');

  async function placeVersion(name: string, content = 'binary') {
    await mkdir(join(parent(), name), { recursive: true });
    const tools = ffmpegToolsIn(join(parent(), name));
    await writeFile(tools.ffmpeg, content);
    await writeFile(tools.ffprobe, content);
  }

  async function age(name: string, hours: number) {
    const then = new Date(Date.now() - hours * 60 * 60 * 1000);
    await utimes(join(parent(), name), then, then);
  }

  it('are swept by the build that uses the new one, newer ones and young installs kept', async () => {
    for (const name of [
      '4.1.0',
      '8.9.9',
      FFMPEG_VERSION,
      '99.0.0',
      `${FFMPEG_VERSION}.partial-old`,
      `${FFMPEG_VERSION}.partial-young`,
      `${FFMPEG_VERSION}.replaced-old`,
      'notes',
    ]) {
      await placeVersion(name);
    }
    await age(`${FFMPEG_VERSION}.partial-old`, 2);
    await age(`${FFMPEG_VERSION}.replaced-old`, 2);
    const logged: string[] = [];
    await removeOtherFfmpegVersions(root, (line) => logged.push(line));
    expect((await readdir(parent())).sort()).toEqual(
      [
        FFMPEG_VERSION,
        '99.0.0',
        `${FFMPEG_VERSION}.partial-young`,
        'notes',
      ].sort(),
    );
    expect(logged).toHaveLength(4);
    // Nothing to sweep is not an error.
    await expect(
      removeOtherFfmpegVersions(join(root, 'none')),
    ).resolves.toBeUndefined();
  });

  it('are kept while the pinned version is missing or unfinished', async () => {
    await placeVersion('4.1.0');
    await removeOtherFfmpegVersions(root);
    expect(await readdir(parent())).toEqual(['4.1.0']);

    // Empty executables are not a version in place.
    await placeVersion(FFMPEG_VERSION, '');
    await removeOtherFfmpegVersions(root);
    expect((await readdir(parent())).sort()).toEqual(
      ['4.1.0', FFMPEG_VERSION].sort(),
    );

    // Nor is ffmpeg without its ffprobe.
    await rm(ffmpegToolsIn(ffmpegToolsDir(root)).ffprobe);
    await writeFile(ffmpegToolsIn(ffmpegToolsDir(root)).ffmpeg, 'binary');
    await removeOtherFfmpegVersions(root);
    expect((await readdir(parent())).sort()).toEqual(
      ['4.1.0', FFMPEG_VERSION].sort(),
    );
  });
});

describe('the copy the tests run', () => {
  it('goes on with a warning when it cannot be fetched', async () => {
    const warned: string[] = [];
    await expect(
      prepareTestFfmpeg({
        root,
        env: {},
        ensure: async () => {
          throw new FfmpegInstallError('Could not reach github.com');
        },
        warn: (message) => warned.push(message),
      }),
    ).resolves.toBeUndefined();
    expect(warned).toEqual([
      expect.stringMatching(/tests that run it will fail.*github\.com/),
    ]);
  });

  it('is not fetched when one is there', async () => {
    let fetched = false;
    await prepareTestFfmpeg({
      root,
      env: { THEI_FFMPEG: join(root, 'own', 'ffmpeg') },
      ensure: async () => {
        fetched = true;
        throw new Error('must not fetch');
      },
      warn: () => {},
    });
    expect(fetched).toBe(false);
  });
});

describe('asking a tool its version', () => {
  it('rejects a tool that is not there', async () => {
    await expect(toolVersion(join(root, 'no-such-ffmpeg'))).rejects.toThrow();
  });

  it('gives up on a tool that does not answer', async () => {
    // cmd.exe takes `-version` for nothing and waits for commands; a script
    // that sleeps does the same elsewhere.
    let hanging = join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'cmd.exe',
    );
    if (process.platform !== 'win32') {
      hanging = join(root, 'hanging');
      await writeFile(hanging, '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
    }
    const started = Date.now();
    await expect(toolVersion(hanging, { timeout: 300 })).rejects.toThrow(
      /timed out/,
    );
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 15_000);
});

describe('installing the tools', () => {
  const build = {
    target: 'test',
    archive: 'ffmpeg-test-build.tar',
    url: 'https://example.invalid/ffmpeg-test-build.tar',
    sha256: 'f'.repeat(64),
    root: 'ffmpeg-test-build',
  };

  const serving = (body: Uint8Array, status = 200): typeof fetch =>
    (async () =>
      new Response(status === 200 ? body : null, { status })) as typeof fetch;

  /** The pinned build, fetched quickly, with no ffmpeg of one's own set. */
  const install = (options: Partial<EnsureFfmpegOptions>) =>
    ensureFfmpeg({
      projectPath: root,
      build,
      env: {},
      retryDelaySeconds: 0,
      ...options,
    });

  const mustNotDownload = (async () => {
    throw new Error('must not download');
  }) as typeof fetch;

  it('refuses an archive whose hash is not the pinned one, and leaves nothing behind', async () => {
    const logged: string[] = [];
    let calls = 0;
    await expect(
      install({
        fetch: (async (...args: Parameters<typeof fetch>) => {
          calls += 1;
          return await serving(new TextEncoder().encode('not the build'))(
            ...args,
          );
        }) as typeof fetch,
        log: (message) => logged.push(message),
      }),
    ).rejects.toThrow(FfmpegInstallError);
    // A whole body that is not the build is not asked for again.
    expect(calls).toBe(1);
    await expect(
      install({ fetch: serving(new TextEncoder().encode('not the build')) }),
    ).rejects.toThrow(/does not match its pinned SHA-256/);
    expect(existsSync(ffmpegToolsDir(root))).toBe(false);
    expect(await readdir(join(root, '.thei', 'tmp'))).toEqual([]);
    expect(logged.some((line) => /Downloading/.test(line))).toBe(true);
  });

  it('asks GitHub again after a failure, and gives up after a few', async () => {
    let calls = 0;
    const logged: string[] = [];
    await expect(
      install({
        log: (line) => logged.push(line),
        fetch: (async () => {
          calls += 1;
          throw new Error('getaddrinfo ENOTFOUND github.com');
        }) as typeof fetch,
      }),
    ).rejects.toThrow(/github\.com/);
    expect(calls).toBe(4);
    expect(logged.filter((line) => /trying again/.test(line))).toHaveLength(3);

    calls = 0;
    await expect(
      install({
        fetch: (async () => {
          calls += 1;
          return new Response(null, { status: 504 });
        }) as typeof fetch,
      }),
    ).rejects.toThrow(/answered 504/);
    expect(calls).toBe(4);

    // A 5xx that clears up on the second try goes on to the checksum.
    calls = 0;
    await expect(
      install({
        fetch: (async () => {
          calls += 1;
          return calls === 1
            ? new Response(null, { status: 502 })
            : new Response(new TextEncoder().encode('not the build'), {
                status: 200,
              });
        }) as typeof fetch,
      }),
    ).rejects.toThrow(/does not match its pinned SHA-256/);
    expect(calls).toBe(2);

    // A 4xx is final: the build is not where it was pinned.
    calls = 0;
    await expect(
      install({
        fetch: (async () => {
          calls += 1;
          return new Response(null, { status: 404 });
        }) as typeof fetch,
      }),
    ).rejects.toThrow(/answered 404/);
    expect(calls).toBe(1);
  });

  it('downloads again when the body breaks off partway', async () => {
    let calls = 0;
    const logged: string[] = [];
    const breakingOff = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('the first half'));
          controller.error(new Error('read ECONNRESET'));
        },
      });
    await expect(
      install({
        log: (line) => logged.push(line),
        fetch: (async () => {
          calls += 1;
          return calls === 1
            ? new Response(breakingOff())
            : new Response(new TextEncoder().encode('not the build'));
        }) as typeof fetch,
      }),
    ).rejects.toThrow(/does not match its pinned SHA-256/);
    // The second body reached the checksum whole, not appended to the first.
    expect(calls).toBe(2);
    expect(logged.some((line) => /broke off.*ECONNRESET/.test(line))).toBe(
      true,
    );

    calls = 0;
    await expect(
      install({
        fetch: (async () => {
          calls += 1;
          return new Response(breakingOff());
        }) as typeof fetch,
      }),
    ).rejects.toThrow(/broke off.*github\.com for this step/);
    expect(calls).toBe(4);
    expect(await readdir(join(root, '.thei', 'tmp'))).toEqual([]);
  });

  it('asks for xz before fetching a .tar.xz it could not unpack', async () => {
    const tarXz = {
      ...build,
      archive: 'ffmpeg-test-build.tar.xz',
      url: 'https://example.invalid/ffmpeg-test-build.tar.xz',
    };
    await expect(
      install({
        build: tarXz,
        platform: 'linux',
        xz: join(root, 'no-such-xz'),
        fetch: mustNotDownload,
      }),
    ).rejects.toThrow(/apt-get install xz-utils.*nothing was downloaded/);
    // Where xz runs, the download goes ahead.
    await expect(
      install({
        build: tarXz,
        platform: 'linux',
        xz: process.execPath,
        fetch: serving(new TextEncoder().encode('not the build')),
      }),
    ).rejects.toThrow(/does not match its pinned SHA-256/);
  });

  it('checks an ffmpeg of the operator’s own and fetches nothing', async () => {
    const own = resolveFfmpegTools();
    const result = await install({
      // A platform without a pinned build, which is what the variable is for.
      platform: 'darwin',
      build: undefined,
      env: { THEI_FFMPEG: own.ffmpeg, THEI_FFPROBE: own.ffprobe },
      fetch: mustNotDownload,
    });
    expect(result).toMatchObject({
      ffmpeg: own.ffmpeg,
      ffprobe: own.ffprobe,
      installed: false,
      version: expect.stringMatching(/^ffmpeg version/),
    });
    expect(existsSync(ffmpegToolsDir(root))).toBe(false);

    await expect(
      install({
        env: {
          THEI_FFMPEG: own.ffmpeg,
          THEI_FFPROBE: join(root, 'no-such-ffprobe'),
        },
        fetch: mustNotDownload,
      }),
    ).rejects.toThrow(/no-such-ffprobe does not run/);
  }, 30_000);

  it.skipIf(process.platform === 'win32')(
    'does nothing when the pinned version is in place and answers',
    async () => {
      const directory = ffmpegToolsDir(root);
      await mkdir(directory, { recursive: true });
      const tools = ffmpegToolsIn(directory);
      await writeFile(
        tools.ffmpeg,
        '#!/bin/sh\necho "ffmpeg version test-build"\n',
        { mode: 0o755 },
      );
      await writeFile(tools.ffprobe, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const result = await install({ fetch: mustNotDownload });
      expect(result).toEqual({
        ...tools,
        installed: false,
        version: 'ffmpeg version test-build',
      });
    },
  );
});
