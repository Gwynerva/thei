import type Database from 'better-sqlite3';

/** Database invariants also protect saves that race with the cleanup worker. */
export function ensureAssetIntegrity(db: Database.Database) {
  db.exec(`
    DROP TRIGGER IF EXISTS internal_asset_cannot_be_selected;
    CREATE INDEX IF NOT EXISTS assets_content_hash_idx ON assets(contentHash);
    CREATE TRIGGER IF NOT EXISTS asset_usage_requires_asset
    BEFORE INSERT ON "asset-usages"
    WHEN NOT EXISTS (SELECT 1 FROM assets WHERE assetUuid=NEW.assetUuid)
    BEGIN SELECT RAISE(ABORT, 'Asset no longer exists'); END;
    CREATE TRIGGER IF NOT EXISTS asset_usage_update_requires_asset
    BEFORE UPDATE OF assetUuid ON "asset-usages"
    WHEN NOT EXISTS (SELECT 1 FROM assets WHERE assetUuid=NEW.assetUuid)
    BEGIN SELECT RAISE(ABORT, 'Asset no longer exists'); END;
    CREATE TRIGGER IF NOT EXISTS used_asset_cannot_be_deleted
    BEFORE DELETE ON assets
    WHEN EXISTS (SELECT 1 FROM "asset-usages" WHERE assetUuid=OLD.assetUuid)
    BEGIN SELECT RAISE(ABORT, 'Asset is still in use'); END;
    CREATE TRIGGER IF NOT EXISTS preview_usage_requires_owner
    BEFORE INSERT ON "asset-usages"
    WHEN NEW.containerType='asset' AND NOT EXISTS (SELECT 1 FROM assets WHERE assetUuid=NEW.containerId)
    BEGIN SELECT RAISE(ABORT, 'Preview owner no longer exists'); END;
  `);
}
