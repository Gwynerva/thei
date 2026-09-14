import Database from 'better-sqlite3';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { ensureAssetIntegrity } from '../server/thei/assets/schema-integrity.ts';

const content = resolve(process.argv[2] ?? '.playground/content');
const db = new Database(join(content, 'thei.db'));
await mkdir(join(content, 'backups'), { recursive: true });
const backup = join(content, 'backups', 'before-asset-library-' + Date.now() + '.db');
await db.backup(backup);
db.transaction(() => ensureAssetIntegrity(db))();
console.log(JSON.stringify({ backup, integrity: db.pragma('integrity_check'), indexes: db.pragma('index_list(assets)') }, null, 2));
db.close();
