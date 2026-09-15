import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Read-only audit. Pass the content directory of the installation to inspect.
const content = resolve(process.argv[2] ?? '.playground/content');
const db = new Database(join(content, 'thei.db'), { readonly: true });
const assetRoot = join(content, 'assets');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all() as { name: string }[];
const counts = Object.fromEntries(
  tables.map(({ name }) => [
    name,
    (
      db
        .prepare(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`)
        .get() as { n: number }
    ).n,
  ]),
);

/**
 * One entry per stored file, not per row.
 *
 * Files are addressed by content, so rows that share a hash and extension
 * share one file. Auditing per row would hash the same bytes repeatedly and
 * report a single problem once per row referencing it.
 */
const blobs = db
  .prepare(
    `SELECT contentHash, extension, min(size) AS size, count(*) AS rows
     FROM assets GROUP BY contentHash, extension`,
  )
  .all() as {
  contentHash: string;
  extension: string;
  size: number;
  rows: number;
}[];

const files: string[] = [];
async function walk(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(
    () => [],
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(assetRoot);

const expected = new Set<string>();
const problems: { file: string; issue: string }[] = [];

for (const blob of blobs) {
  // The path is derived, not searched: content addressing means a file's
  // location is a function of its bytes, which is also what makes a
  // misplaced file detectable rather than silently accepted.
  const name = `${blob.contentHash}.${blob.extension}`;
  const path = join(assetRoot, blob.contentHash.slice(0, 2), name);
  expected.add(path);

  const entry = await stat(path).catch(() => null);
  if (!entry?.isFile()) {
    problems.push({ file: name, issue: 'missing-file' });
    continue;
  }
  if (entry.size !== blob.size) {
    problems.push({ file: name, issue: 'size-mismatch' });
  }

  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  if (hash.digest('hex') !== blob.contentHash) {
    problems.push({ file: name, issue: 'hash-mismatch' });
  }
}

for (const path of files) {
  if (!expected.has(path)) problems.push({ file: path, issue: 'stray-file' });
}

console.log(
  JSON.stringify(
    {
      integrity: db.pragma('integrity_check'),
      counts,
      files: files.length,
      blobs: blobs.length,
      /** Rows sharing one file. Expected, and the point of content addressing. */
      sharedBlobs: blobs.filter((blob) => blob.rows > 1).length,
      bytesOnDisk: blobs.reduce((total, blob) => total + blob.size, 0),
      problems,
      danglingAssets: db
        .prepare(
          'SELECT count(*) AS n FROM "asset-usages" u LEFT JOIN assets a ON a.assetUuid=u.assetUuid WHERE a.assetUuid IS NULL',
        )
        .get(),
      /**
       * Bytes stored more than once. Should always be empty: identical bytes
       * with the same extension resolve to the same path.
       */
      duplicates: db
        .prepare(
          `SELECT contentHash, extension, count(DISTINCT extension) AS variants
           FROM assets WHERE settings IS NOT NULL
           GROUP BY contentHash HAVING count(DISTINCT extension) > 1`,
        )
        .all(),
      assetIndexes: db.pragma('index_list(assets)'),
    },
    null,
    2,
  ),
);
db.close();
