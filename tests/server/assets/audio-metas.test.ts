import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { AssetType, type AudioAssetMeta } from '../../../shared/asset';
import { createOriginalAssetSettings } from '../../../shared/asset-upload-settings';
import {
  completeAudioMetas,
  findAudioWithoutWaveforms,
} from '../../../server/thei/assets/audio';
import { storeAsset } from '../../../server/thei/assets/storage';
import { createAsset } from '../../../server/thei/assets/repository/create';
import { findAssetByIdentity } from '../../../server/thei/assets/repository/find-by-identity';
import { findAssetBySlug } from '../../../server/thei/assets/repository/find-by-slug';
import { findAssetByUuid } from '../../../server/thei/assets/repository/find-by-uuid';
import { touchAsset } from '../../../server/thei/assets/repository/touch';
import { updateAsset } from '../../../server/thei/assets/repository/update';
import { schema } from '../../../server/thei/db/schema';
import audioWaveforms from '../../../update/tasks/0.0.4-audio-waveforms';

let root = '';
let rawDb: Database.Database;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-audio-metas-'));
  rawDb = new Database(':memory:');
  const db = drizzle(rawDb, { schema });
  rawDb.exec(`
    CREATE TABLE assets (
      assetUuid text PRIMARY KEY,
      slug text NOT NULL UNIQUE,
      extension text NOT NULL,
      familyUuid text NOT NULL,
      contentHash text NOT NULL,
      settingsKey text NOT NULL,
      settings text,
      type text NOT NULL,
      size integer NOT NULL,
      touchedAt integer NOT NULL,
      meta text
    );
    CREATE UNIQUE INDEX assets_family_content_settings_idx
      ON assets (familyUuid, contentHash, settingsKey);
  `);
  (globalThis as any).THEI_SERVER = {
    useDb: () => ({ db, schema }),
    assets: {
      filePath: (contentHash: string, extension: string) =>
        join(
          root,
          'assets',
          contentHash.slice(0, 2),
          `${contentHash}.${extension}`,
        ),
      create: createAsset,
      update: updateAsset,
      findByIdentity: findAssetByIdentity,
      findByUuid: findAssetByUuid,
      findBySlug: findAssetBySlug,
      touch: touchAsset,
    },
  };
});

afterEach(async () => {
  rawDb.close();
  delete (globalThis as any).THEI_SERVER;
  await rm(root, { recursive: true, force: true });
});

function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegInstaller.path, ['-y', ...args], {
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
}

/** A recording stored by 0.0.3: as it was uploaded, nothing read of it. */
async function storeOld(name: string, bytes: Buffer, extension: string) {
  const { asset } = await storeAsset({
    bytes: { buffer: bytes },
    extension,
    familyUuid: `family-${name}`,
    settingsKey: 'original',
    settings: createOriginalAssetSettings(),
    type: AssetType.Audio,
    meta: {} as AudioAssetMeta,
  });
  return asset;
}

describe('recordings stored before their waveforms were read', () => {
  it('reads each one once, and names the one it cannot read', async () => {
    const wav = join(root, 'memo.wav');
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=220:sample_rate=16000:duration=2',
      '-ac',
      '1',
      wav,
    ]);
    const memo = await storeOld('memo', await readFile(wav), 'wav');
    const broken = await storeOld('broken', Buffer.from('not sound'), 'm4a');
    expect(
      (await findAudioWithoutWaveforms()).map((asset) => asset.assetUuid),
    ).toEqual([memo.assetUuid, broken.assetUuid]);

    const progress: [number, number][] = [];
    const logged: string[] = [];
    await audioWaveforms.run({
      progress: (done, total) => {
        progress.push([done, total]);
      },
      log: (message) => logged.push(message),
    });

    expect(progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    const read = (await findAssetByUuid(memo.assetUuid))!
      .meta as AudioAssetMeta;
    expect(read.duration).toBeCloseTo(2, 1);
    expect(read.peaks).toHaveLength(128);
    expect(read.channels).toBe(1);
    expect((await findAssetByUuid(broken.assetUuid))!.meta).toEqual({
      duration: 0,
      peaks: [],
    });
    expect(logged).toEqual([
      expect.stringContaining(`${broken.slug}.m4a (${broken.assetUuid})`),
    ]);
    // Nothing is left to read.
    expect(await findAudioWithoutWaveforms()).toEqual([]);
    expect((await completeAudioMetas()).total).toBe(0);
  });

  it('fails the pass, rather than mark the files unreadable, when ffmpeg cannot run', async () => {
    const memo = await storeOld('memo', Buffer.from('anything'), 'wav');
    const installed = ffmpegInstaller.path;
    (ffmpegInstaller as { path: string }).path = join(root, 'no-ffmpeg');
    try {
      await expect(completeAudioMetas()).rejects.toThrow();
    } finally {
      (ffmpegInstaller as { path: string }).path = installed;
    }
    expect(
      (await findAudioWithoutWaveforms()).map((asset) => asset.assetUuid),
    ).toEqual([memo.assetUuid]);
  });

  it('reads the bytes several recordings share once', async () => {
    const wav = join(root, 'memo.wav');
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=220:sample_rate=16000:duration=1',
      wav,
    ]);
    const bytes = await readFile(wav);
    const first = await storeOld('first', bytes, 'wav');
    const second = await storeOld('second', bytes, 'wav');
    const { unreadable } = await completeAudioMetas();
    expect(unreadable).toEqual([]);
    expect((await findAssetByUuid(second.assetUuid))!.meta).toEqual(
      (await findAssetByUuid(first.assetUuid))!.meta,
    );
  });

  it('leaves a recording that already has its waveform alone', async () => {
    const { asset } = await storeAsset({
      bytes: { buffer: Buffer.from('already read') },
      extension: 'weba',
      familyUuid: 'family-new',
      settingsKey: 'audio-transform:q75:mono:0',
      settings: { type: 'audio-transform', quality: 75, mono: false },
      type: AssetType.Audio,
      meta: { duration: 3, peaks: [1, 2, 3] },
    });
    expect(await findAudioWithoutWaveforms()).toEqual([]);
    expect((await findAssetByUuid(asset.assetUuid))!.meta).toEqual({
      duration: 3,
      peaks: [1, 2, 3],
    });
  });
});
