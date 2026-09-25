import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { externalLinks } from '../../server/thei/db/schema/external-links';
import {
  findExternalLink,
  upsertExternalLink,
} from '../../server/thei/external-links/repository';
import { createMediaPreviewAsset } from '../../server/thei/assets/storage';
import { AssetType } from '../../shared/asset';

let rawDb: Database.Database | undefined;
afterEach(() => {
  rawDb?.close();
  rawDb = undefined;
  vi.unstubAllGlobals();
});

it('replaces a stored favicon color with neutral and clears a missing color', async () => {
  rawDb = new Database(':memory:');
  rawDb.exec(
    `CREATE TABLE "external-links" (url TEXT PRIMARY KEY, title TEXT, description TEXT, faviconKey TEXT NOT NULL, accent TEXT, status TEXT NOT NULL DEFAULT 'complete', touchedAt INTEGER NOT NULL)`,
  );
  const schema = { externalLinks };
  const db = drizzle(rawDb, { schema });
  vi.stubGlobal('THEI_SERVER', { useDb: () => ({ db, schema }) });
  const base = {
    url: 'https://example.com/',
    faviconKey: 'example',
    touchedAt: 1,
  };
  upsertExternalLink({ ...base, accent: { hue: 230, chroma: 0.03 } });
  expect((await findExternalLink(base.url))?.faviconMedia.accent).toEqual({
    hue: 230,
    chroma: 0.03,
  });
  upsertExternalLink({ ...base, accent: { hue: 0, chroma: 0 } });
  expect((await findExternalLink(base.url))?.faviconMedia.accent).toEqual({
    hue: 0,
    chroma: 0,
  });
  upsertExternalLink(base);
  expect(
    (await findExternalLink(base.url))?.faviconMedia.accent,
  ).toBeUndefined();
  expect(db.select().from(externalLinks).get()?.accent).toBeNull();
});

it.each([
  { hue: 230, chroma: 0.03 },
  { hue: 0, chroma: 0 },
])(
  'reuses the complete accent of a deduplicated preview (%j)',
  async (accent) => {
    const touch = vi.fn();
    vi.stubGlobal('THEI_SERVER', {
      assets: {
        findByIdentity: async () => ({
          assetUuid: 'preview',
          meta: { accent },
        }),
        touch,
      },
    });
    const source = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#777' },
    })
      .png()
      .toBuffer();
    expect(await createMediaPreviewAsset(source, AssetType.Image)).toEqual({
      previewAssetUuid: 'preview',
      accent,
    });
    expect(touch).toHaveBeenCalledWith('preview');
  },
);
