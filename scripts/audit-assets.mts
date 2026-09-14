import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Read-only audit. Pass the content directory of the installation to inspect.
const content = resolve(process.argv[2] ?? '.playground/content');
const db = new Database(join(content, 'thei.db'), { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
const counts = Object.fromEntries(tables.map(({ name }) => [name, (db.prepare(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`).get() as { n: number }).n]));
const assets = db.prepare('SELECT assetUuid, extension, size, contentHash FROM assets').all() as { assetUuid: string; extension: string; size: number; contentHash: string }[];
const files: string[] = [];
async function walk(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(join(content, 'assets'));
const problems: { assetUuid: string; issue: string }[] = [];
for (const asset of assets) {
  const path = files.find(p => p.endsWith(`${asset.assetUuid}.${asset.extension}`));
  if (!path) { problems.push({ assetUuid: asset.assetUuid, issue: 'missing-file' }); continue; }
  if ((await stat(path)).size !== asset.size) problems.push({ assetUuid: asset.assetUuid, issue: 'size-mismatch' });
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  if (hash.digest('hex') !== asset.contentHash) problems.push({ assetUuid: asset.assetUuid, issue: 'hash-mismatch' });
}
console.log(JSON.stringify({
  integrity: db.pragma('integrity_check'), counts, files: files.length, problems,
  danglingAssets: db.prepare('SELECT count(*) AS n FROM "asset-usages" u LEFT JOIN assets a ON a.assetUuid=u.assetUuid WHERE a.assetUuid IS NULL').get(),
  duplicates: db.prepare('SELECT contentHash, count(*) AS count FROM assets WHERE settings IS NOT NULL GROUP BY contentHash HAVING count(*)>1').all(),
  assetIndexes: db.pragma('index_list(assets)'),
}, null, 2));
db.close();
