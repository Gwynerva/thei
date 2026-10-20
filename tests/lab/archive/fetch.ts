// Fetches the release the lock pins into the shared cache: `release.json`
// (its hash pinned by the lock), the texts, and the media packs — each
// downloaded with resume, checked against its sha256, the texts unpacked
// into `archive/<version>/text/`, every media file into `blobs/` by its own
// hash. Safe to run again, and from two checkouts at once.
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import { cachePaths } from '../config';
import type { ArchiveLock, ArchiveRelease } from '../types';
import { blobPath } from './source';

export function releaseBase(lock: ArchiveLock): string {
  return (
    process.env.THEI_LAB_RELEASE_BASE ??
    `https://github.com/${lock.repo}/releases/download/v${lock.version}/`
  );
}

export async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** One fetch of a version at a time, across checkouts; a dead holder's lock is taken over. */
async function withLock<T>(name: string, work: () => Promise<T>): Promise<T> {
  const path = join(cachePaths().locks, `${name}.lock`);
  mkdirSync(dirname(path), { recursive: true });
  for (;;) {
    try {
      writeFileSync(path, String(process.pid), { flag: 'wx' });
      break;
    } catch {
      const holder = Number(readFileSync(path, 'utf8'));
      if (!holder || !alive(holder)) {
        rmSync(path, { force: true });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  try {
    return await work();
  } finally {
    rmSync(path, { force: true });
  }
}

/** Downloads `url` to `target`, carrying on from a `.part` left by an earlier try. */
export async function download(
  url: string,
  target: string,
  expected: { sha256: string; bytes?: number },
  log: (message: string) => void,
) {
  if (existsSync(target) && (await sha256Of(target)) === expected.sha256)
    return;
  mkdirSync(dirname(target), { recursive: true });
  const part = `${target}.part`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const have = existsSync(part) ? statSync(part).size : 0;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: have ? { range: `bytes=${have}-` } : {},
        redirect: 'follow',
      });
    } catch (error) {
      // A connection that broke before or while the answer began: what came is kept.
      log(`  … ${url}: ${(error as Error).message}; trying again`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    if (response.status === 416) rmSync(part, { force: true });
    else if (!response.ok || !response.body) {
      log(`  … ${url}: ${response.status}; trying again`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      continue;
    } else {
      const append = response.status === 206 && have > 0;
      if (have && !append)
        log(`  … ${url}: the server does not resume; starting over`);
      try {
        await pipeline(
          Readable.fromWeb(response.body as never),
          createWriteStream(part, { flags: append ? 'a' : 'w' }),
        );
      } catch (error) {
        log(`  … ${url}: ${(error as Error).message}; resuming`);
        continue;
      }
    }
    if (!existsSync(part)) continue;
    const sha = await sha256Of(part);
    if (sha === expected.sha256) {
      renameSync(part, target);
      return;
    }
    if (expected.bytes && statSync(part).size < expected.bytes) continue;
    rmSync(part, { force: true });
    log(`  … ${url}: the bytes do not match their hash; downloading again`);
  }
  throw new Error(`${url} could not be downloaded whole.`);
}

export interface FetchResult {
  release: ArchiveRelease;
  downloaded: string[];
  blobs: number;
}

export async function fetchRelease(
  lock: ArchiveLock,
  options: { packs: 'all' | 'none'; log: (message: string) => void },
): Promise<FetchResult> {
  const { log } = options;
  const cache = cachePaths();
  const root = join(cache.archive, lock.version);
  const base = releaseBase(lock);
  return withLock(`archive-${lock.version}`, async () => {
    const downloaded: string[] = [];
    const releasePath = join(root, 'release.json');
    await download(
      `${base}release.json`,
      releasePath,
      { sha256: lock.releaseJsonSha256 },
      log,
    );
    const release = JSON.parse(
      readFileSync(releasePath, 'utf8'),
    ) as ArchiveRelease;
    if (release.version !== lock.version)
      throw new Error(
        `release.json says ${release.version}, the lock ${lock.version}.`,
      );

    // The texts.
    const textDir = join(root, 'text');
    const textMarker = join(textDir, '.sha256');
    if (
      !existsSync(textMarker) ||
      readFileSync(textMarker, 'utf8') !== release.text.sha256
    ) {
      const tarPath = join(
        cache.downloads,
        `${lock.version}-${release.text.asset}`,
      );
      await download(
        `${base}${release.text.asset}`,
        tarPath,
        release.text,
        log,
      );
      downloaded.push(release.text.asset);
      const work = `${textDir}.tmp-${process.pid}`;
      rmSync(work, { recursive: true, force: true });
      mkdirSync(work, { recursive: true });
      await tar.x({ file: tarPath, cwd: work });
      writeFileSync(join(work, '.sha256'), release.text.sha256);
      rmSync(textDir, { recursive: true, force: true });
      renameSync(work, textDir);
      rmSync(tarPath, { force: true });
    }

    // The media, pack by pack, skipping a pack whose files the cache has.
    let blobs = 0;
    if (options.packs === 'all')
      for (const pack of release.packs) {
        const files = Object.entries(release.files).filter(
          ([, file]) => file.pack === pack.asset,
        );
        if (files.every(([, file]) => existsSync(blobPath(file.sha256))))
          continue;
        const tarPath = join(cache.downloads, `${lock.version}-${pack.asset}`);
        log(`Downloading ${pack.asset} (${Math.round(pack.bytes / 1e6)} MB)`);
        await download(`${base}${pack.asset}`, tarPath, pack, log);
        downloaded.push(pack.asset);
        const work = join(cache.downloads, `${pack.asset}.tmp-${process.pid}`);
        rmSync(work, { recursive: true, force: true });
        mkdirSync(work, { recursive: true });
        await tar.x({ file: tarPath, cwd: work });
        for (const [id, file] of files) {
          const extracted = join(work, file.path);
          if (!existsSync(extracted))
            throw new Error(`${pack.asset} lacks ${file.path} (file ${id}).`);
          if ((await sha256Of(extracted)) !== file.sha256)
            throw new Error(
              `${file.path} in ${pack.asset} does not match its hash.`,
            );
          const blob = blobPath(file.sha256);
          if (!existsSync(blob)) {
            mkdirSync(dirname(blob), { recursive: true });
            renameSync(extracted, blob);
            blobs++;
          }
        }
        rmSync(work, { recursive: true, force: true });
        rmSync(tarPath, { force: true });
      }
    return { release, downloaded, blobs };
  });
}

/** Archive versions the cache holds, for status. */
export function fetchedVersions(): string[] {
  const dir = cachePaths().archive;
  return existsSync(dir)
    ? readdirSync(dir).filter((name) =>
        existsSync(join(dir, name, 'release.json')),
      )
    : [];
}
