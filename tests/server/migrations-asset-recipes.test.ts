import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import assetRecipes from '../../update/migrations/0.0.2-asset-recipes';
import type { MigrationContext } from '../../update/migrations/types';

let rawDb: Database.Database;

const context = (): MigrationContext => ({
  rawDb,
  contentPath: () => '',
  readConfig: async () => ({}),
  writeConfig: async () => {},
  log: () => {},
});

function insert(
  assetUuid: string,
  settingsKey: string,
  settings: unknown,
  meta: unknown,
  row: {
    family?: string;
    hash?: string;
    type?: string;
    extension?: string;
  } = {},
) {
  rawDb
    .prepare(
      `INSERT INTO assets
        (assetUuid, slug, extension, familyUuid, contentHash, settingsKey,
         settings, type, size, touchedAt, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 10, 0, ?)`,
    )
    .run(
      assetUuid,
      `slug-${assetUuid}`,
      row.extension ?? 'avif',
      row.family ?? 'family',
      row.hash ?? `hash-${assetUuid}`,
      settingsKey,
      settings === null ? null : JSON.stringify(settings),
      row.type ?? 'image',
      meta === null ? null : JSON.stringify(meta),
    );
}

function read(assetUuid: string) {
  const row = rawDb
    .prepare(
      'SELECT settingsKey, settings, meta FROM assets WHERE assetUuid = ?',
    )
    .get(assetUuid) as {
    settingsKey: string;
    settings: string | null;
    meta: string | null;
  };
  return {
    settingsKey: row.settingsKey,
    settings: row.settings ? JSON.parse(row.settings) : null,
    meta: row.meta ? JSON.parse(row.meta) : null,
  };
}

beforeEach(() => {
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE assets (
      assetUuid text PRIMARY KEY NOT NULL,
      slug text NOT NULL UNIQUE,
      extension text NOT NULL,
      familyUuid text NOT NULL,
      contentHash text NOT NULL,
      settingsKey text NOT NULL,
      settings text,
      type text NOT NULL,
      size integer NOT NULL,
      touchedAt integer NOT NULL,
      meta text,
      UNIQUE (familyUuid, contentHash, settingsKey)
    );
  `);
});

afterEach(() => {
  rawDb.close();
});

describe('asset recipes migration', () => {
  it('turns "fill" into the centred crop of the original it was cut from', () => {
    insert(
      'a-original',
      'original',
      { type: 'original' },
      {
        width: 4000,
        height: 3000,
      },
      { extension: 'jpg' },
    );
    insert(
      'a-cover',
      'image-transform:q90:w1200:h675:fit:cover:up:1:fmt:avif',
      {
        type: 'image-transform',
        quality: 90,
        dimensions: { width: 1200, height: 675 },
        resizeMode: 'cover',
        allowUpscale: true,
        format: 'avif',
      },
      { width: 1200, height: 675, accent: { hue: 10, chroma: 0.1 } },
    );

    assetRecipes.up!(context());

    expect(read('a-cover')).toEqual({
      settingsKey:
        'image-transform:q90:w1200:h675:crop:0,375,4000,2250:fmt:avif',
      settings: {
        type: 'image-transform',
        quality: 90,
        crop: { left: 0, top: 375, width: 4000, height: 2250 },
        dimensions: { width: 1200, height: 675 },
        format: 'avif',
      },
      meta: {
        width: 1200,
        height: 675,
        accent: { hue: 10, chroma: 0.1 },
        sourceDimensions: { width: 4000, height: 3000 },
      },
    });
  });

  it('describes a file as its own exact size when nothing is cut or known', () => {
    insert(
      'a-inside',
      'image-transform:q90:w1200:h0:fit:inside:up:0:fmt:avif',
      {
        type: 'image-transform',
        quality: 90,
        dimensions: { width: 1200 },
        resizeMode: 'inside',
        allowUpscale: false,
        format: 'avif',
      },
      { width: 800, height: 600 },
    );
    // "Fill" from an original the family no longer keeps: the region it
    // showed cannot be known, the size of the file can.
    insert(
      'a-orphan-cover',
      'image-transform:q80:w256:h256:fit:cover:up:1:fmt:webp',
      {
        type: 'image-transform',
        quality: 80,
        dimensions: { width: 256, height: 256 },
        resizeMode: 'cover',
        allowUpscale: true,
        format: 'webp',
      },
      { width: 256, height: 256 },
      { family: 'other', extension: 'webp' },
    );

    assetRecipes.up!(context());

    expect(read('a-inside')).toMatchObject({
      settingsKey: 'image-transform:q90:w800:h600:fmt:avif',
      settings: {
        type: 'image-transform',
        quality: 90,
        dimensions: { width: 800, height: 600 },
        format: 'avif',
      },
    });
    expect(read('a-orphan-cover')).toEqual({
      settingsKey: 'image-transform:q80:w256:h256:fmt:webp',
      settings: {
        type: 'image-transform',
        quality: 80,
        dimensions: { width: 256, height: 256 },
        format: 'webp',
      },
      meta: { width: 256, height: 256 },
    });
  });

  it('finishes recipes an earlier build left with a fit note', () => {
    insert(
      'v-original',
      'original',
      { type: 'original' },
      {
        width: 1920,
        height: 1440,
        hasAudio: true,
      },
      { type: 'video', extension: 'mp4' },
    );
    insert(
      'v-noted',
      'video-transform:q85:w1200:h674:fit:cover:up:1:strip:1:fast:0',
      {
        type: 'video-transform',
        quality: 85,
        dimensions: { width: 1200, height: 674 },
        stripAudio: true,
        fastConversion: false,
        legacyFit: 'cover',
      },
      { width: 1200, height: 674, hasAudio: false },
      { type: 'video', extension: 'webm' },
    );

    assetRecipes.up!(context());

    const { settings, settingsKey } = read('v-noted');
    expect(settings).not.toHaveProperty('legacyFit');
    // A video crop lands on even pixels.
    expect(settings.crop).toEqual({
      left: 0,
      top: 180,
      width: 1920,
      height: 1080,
    });
    expect(settingsKey).toBe(
      'video-transform:q85:w1200:h674:crop:0,180,1920,1080:strip:1:fast:0',
    );
  });

  it('keeps the old key where the new one is already taken by the same bytes', () => {
    const recipe = (allowUpscale: boolean) => ({
      type: 'image-transform',
      quality: 90,
      dimensions: { width: 100, height: 100 },
      resizeMode: 'inside',
      allowUpscale,
      format: 'avif',
    });
    insert(
      'a-up',
      'k:up:1',
      recipe(true),
      { width: 100, height: 100 },
      {
        hash: 'same',
      },
    );
    insert(
      'a-down',
      'k:up:0',
      recipe(false),
      { width: 100, height: 100 },
      {
        hash: 'same',
      },
    );

    assetRecipes.up!(context());

    const keys = [read('a-up').settingsKey, read('a-down').settingsKey].sort();
    expect(keys).toEqual(['image-transform:q90:w100:h100:fmt:avif', 'k:up:0']);
    expect(read('a-down').settings).not.toHaveProperty('resizeMode');
  });

  it('leaves current recipes, originals and helper rows alone', () => {
    const current = {
      type: 'image-transform',
      quality: 90,
      crop: { left: 0, top: 0, width: 10, height: 10 },
      dimensions: { width: 10, height: 10 },
      format: 'webp',
    };
    insert('a-current', 'current-key', current, null);
    insert('a-original', 'original', { type: 'original' }, null);
    insert('a-preview', 'internal:media-preview', null, null);

    assetRecipes.up!(context());

    expect(read('a-current').settings).toEqual(current);
    expect(read('a-current').settingsKey).toBe('current-key');
    expect(read('a-original').settings).toEqual({ type: 'original' });
    expect(read('a-preview').settings).toBeNull();
  });

  it('is safe to run again', () => {
    insert(
      'a-original',
      'original',
      { type: 'original' },
      {
        width: 400,
        height: 300,
      },
    );
    insert(
      'a-cover',
      'image-transform:q90:w100:h100:fit:cover:up:0:fmt:avif',
      {
        type: 'image-transform',
        quality: 90,
        dimensions: { width: 100, height: 100 },
        resizeMode: 'cover',
        allowUpscale: false,
        format: 'avif',
      },
      { width: 100, height: 100 },
    );

    assetRecipes.up!(context());
    const once = read('a-cover');
    assetRecipes.up!(context());

    expect(read('a-cover')).toEqual(once);
    expect(once.settings.crop).toEqual({
      left: 50,
      top: 0,
      width: 300,
      height: 300,
    });
  });
});
