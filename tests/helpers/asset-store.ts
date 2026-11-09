import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createAsset } from '../../server/thei/assets/repository/create';
import { findAssetByIdentity } from '../../server/thei/assets/repository/find-by-identity';
import { findAssetBySlug } from '../../server/thei/assets/repository/find-by-slug';
import { findAssetByUuid } from '../../server/thei/assets/repository/find-by-uuid';
import { touchAsset } from '../../server/thei/assets/repository/touch';
import { attachAssetUsage } from '../../server/thei/assets/repository/usages/attach';
import { schema } from '../../server/thei/db/schema';

export interface AssetStore {
  db: ReturnType<typeof drizzle<typeof schema>>;
  rawDb: Database.Database;
  /** Where a stored file lies. */
  filePath: (contentHash: string, extension: string) => string;
  /** The one row with this settings key, if any. */
  findBySettingsKey: (
    settingsKey: string,
  ) => typeof schema.assets.$inferSelect | undefined;
  /** The preview asset linked to this asset, if any. */
  previewOf: (
    assetUuid: string,
  ) => typeof schema.assets.$inferSelect | undefined;
  close: () => void;
}

/**
 * Enough of `THEI_SERVER` for the asset pipeline to store what it makes: an
 * in-memory library under `root`, with the repository functions the real
 * one uses. `close()` takes the global away again.
 */
export function openAssetStore(root: string): AssetStore {
  const rawDb = new Database(':memory:');
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
      meta text
    );
    CREATE UNIQUE INDEX assets_family_content_settings_idx
      ON assets (familyUuid, contentHash, settingsKey);
    CREATE TABLE "asset-usages" (
      assetUuid text NOT NULL,
      containerType text NOT NULL,
      containerId text NOT NULL,
      role text NOT NULL,
      meta text,
      PRIMARY KEY(assetUuid, containerType, containerId, role)
    );
  `);
  const db = drizzle(rawDb, { schema });
  const filePath = (contentHash: string, extension: string) =>
    join(
      root,
      'assets',
      contentHash.slice(0, 2),
      `${contentHash}.${extension}`,
    );
  (globalThis as any).THEI_SERVER = {
    useDb: () => ({ db, schema }),
    projectPath: (...parts: string[]) => join(root, ...parts),
    assets: {
      filePath,
      create: createAsset,
      findByIdentity: findAssetByIdentity,
      findByUuid: findAssetByUuid,
      findBySlug: findAssetBySlug,
      touch: touchAsset,
      usages: {
        attach: attachAssetUsage,
        findByContainer: async (containerType: string, containerId: string) => {
          const rows = db
            .select()
            .from(schema.assetUsages)
            .all()
            .filter(
              (usage) =>
                usage.containerType === containerType &&
                usage.containerId === containerId,
            );
          return rows.map((usage) => ({
            ...usage,
            asset: db
              .select()
              .from(schema.assets)
              .all()
              .find((asset) => asset.assetUuid === usage.assetUuid),
          }));
        },
      },
    },
  };
  return {
    db,
    rawDb,
    filePath,
    findBySettingsKey: (settingsKey) =>
      db
        .select()
        .from(schema.assets)
        .all()
        .find((asset) => asset.settingsKey === settingsKey),
    previewOf: (assetUuid) => {
      const usage = db
        .select()
        .from(schema.assetUsages)
        .all()
        .find((row) => row.role === 'preview' && row.containerId === assetUuid);
      return usage
        ? db
            .select()
            .from(schema.assets)
            .all()
            .find((asset) => asset.assetUuid === usage.assetUuid)
        : undefined;
    },
    close: () => {
      rawDb.close();
      delete (globalThis as any).THEI_SERVER;
    },
  };
}
