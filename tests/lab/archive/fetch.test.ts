// Fetching a release: a made-up one, built from the conformance archive and
// served from this machine — the texts unpacked, every media file in the
// blob store by its hash, a broken download resumed, a wrong hash refused.
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tar from 'tar';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ArchiveLock, ArchiveRelease } from '../types';
import { download, fetchRelease } from './fetch';
import { archiveSource } from './source';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
let server: Server;
let origin = '';
let dist = '';
let cache = '';
let lock: ArchiveLock;
const requests: { path: string; range?: string }[] = [];

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'thei-lab-release-'));
  cache = mkdtempSync(join(tmpdir(), 'thei-lab-cache-'));
  const textDir = archiveSource('conformance').dir;

  // A few made-up media files, in one pack.
  const media = join(dist, 'build');
  mkdirSync(join(media, 'media'), { recursive: true });
  const files: ArchiveRelease['files'] = {};
  for (const [id, body] of [
    ['alpha', 'first file'],
    ['beta', 'second file, a little longer'],
  ] as const) {
    writeFileSync(join(media, 'media', `${id}.txt`), body);
    files[id] = {
      pack: 'media-01.tar',
      path: `media/${id}.txt`,
      sha256: sha(Buffer.from(body)),
      bytes: body.length,
      mime: 'text/plain',
    };
  }
  await tar.c(
    { file: join(dist, 'media-01.tar'), cwd: media, portable: true },
    ['media'],
  );
  await tar.c(
    { file: join(dist, 'text.tar'), cwd: textDir, portable: true },
    readdirSync(textDir),
  );
  const asset = (name: string) => {
    const bytes = readFileSync(join(dist, name));
    return { asset: name, sha256: sha(bytes), bytes: bytes.length };
  };
  const release: ArchiveRelease = {
    format: 1,
    revision: 0,
    version: '9.9.9',
    commit: 'abc',
    text: asset('text.tar'),
    packs: [{ ...asset('media-01.tar'), files: 2 }],
    files,
  };
  writeFileSync(join(dist, 'release.json'), JSON.stringify(release));
  lock = {
    repo: 'test/archive',
    version: '9.9.9',
    commit: 'abc',
    releaseJsonSha256: sha(readFileSync(join(dist, 'release.json'))),
  };

  // Serves dist/, with byte ranges, and cuts the first answer for `cut.bin` short.
  let cutOnce = true;
  server = createServer((request, response) => {
    const name = decodeURIComponent((request.url ?? '/').split('/').pop()!);
    requests.push({ path: name, range: request.headers.range });
    const path = join(dist, name);
    if (!existsSync(path)) return response.writeHead(404).end();
    const bytes = readFileSync(path);
    const range = /bytes=(\d+)-/.exec(request.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      response
        .writeHead(206, {
          'content-range': `bytes ${start}-${bytes.length - 1}/${bytes.length}`,
        })
        .end(bytes.subarray(start));
      return;
    }
    if (name === 'cut.bin' && cutOnce) {
      cutOnce = false;
      response.writeHead(200, { 'content-length': bytes.length });
      response.write(bytes.subarray(0, 1000));
      response.destroy();
      return;
    }
    response.writeHead(200).end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`;
  process.env.THEI_LAB_RELEASE_BASE = origin;
  process.env.THEI_LAB_CACHE = cache;
});

afterAll(() => {
  server?.close();
  delete process.env.THEI_LAB_RELEASE_BASE;
  delete process.env.THEI_LAB_CACHE;
  rmSync(dist, { recursive: true, force: true });
  rmSync(cache, { recursive: true, force: true });
});

describe('fetching a release', () => {
  // Packing and hashing the conformance archive takes a while on Windows.
  it(
    'unpacks the texts and stores every file by its hash, once',
    { timeout: 30_000 },
    async () => {
      const result = await fetchRelease(lock, { packs: 'all', log: () => {} });
      expect(result.blobs).toBe(2);
      expect(
        existsSync(join(cache, 'archive', '9.9.9', 'text', 'archive.yaml')),
      ).toBe(true);
      for (const file of Object.values(result.release.files))
        expect(
          existsSync(
            join(cache, 'blobs', file.sha256.slice(0, 2), file.sha256),
          ),
        ).toBe(true);
      const again = await fetchRelease(lock, { packs: 'all', log: () => {} });
      expect(again.downloaded).toEqual([]);
    },
  );

  it('refuses a release.json other than the one the lock pins', async () => {
    await expect(
      fetchRelease(
        { ...lock, version: '9.9.8', releaseJsonSha256: 'f'.repeat(64) },
        { packs: 'none', log: () => {} },
      ),
    ).rejects.toThrow(/could not be downloaded whole/);
  });

  it('tries again when the connection breaks', async () => {
    const bytes = Buffer.alloc(200_000, 7);
    writeFileSync(join(dist, 'cut.bin'), bytes);
    const target = join(cache, 'downloads', 'cut.bin');
    await download(
      `${origin}cut.bin`,
      target,
      { sha256: sha(bytes), bytes: bytes.length },
      () => {},
    );
    expect(statSync(target).size).toBe(bytes.length);
  });

  it('resumes from what an earlier try left', async () => {
    const bytes = Buffer.from(
      Array.from({ length: 120_000 }, (_, index) => index % 251),
    );
    writeFileSync(join(dist, 'half.bin'), bytes);
    const target = join(cache, 'downloads', 'half.bin');
    mkdirSync(join(cache, 'downloads'), { recursive: true });
    writeFileSync(`${target}.part`, bytes.subarray(0, 50_000));
    await download(
      `${origin}half.bin`,
      target,
      { sha256: sha(bytes), bytes: bytes.length },
      () => {},
    );
    expect(readFileSync(target).equals(bytes)).toBe(true);
    expect(
      requests
        .filter((request) => request.path === 'half.bin')
        .map((request) => request.range),
    ).toEqual(['bytes=50000-']);
  });
});
