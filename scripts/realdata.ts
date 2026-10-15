// A copy of a real site's backup to try changes on, beside the playground's
// made-up data: `.realdata/content`, served by `bun run dev:realdata` at
// http://realdata.localhost:3002 — its own host name, so signing in there
// replaces neither the playground's session nor the fixture's.
//
//   bun scripts/realdata.ts restore <backup-dir> [--replace]
//   bun scripts/realdata.ts sign-in
//
// The backup itself is never written to. The copy keeps its owner's secret
// phrase and password, which nothing here reads: it is entered by a one-time
// sign-in link instead, as AGENTS.md describes for the playground. The copy
// is ignored by git; delete it when done.
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = fileURLToPath(new URL('..', import.meta.url));
const content = `${root}.realdata/content`;
const origin = 'http://realdata.localhost:3002';

const [command, source] = process.argv.slice(2);

if (command === 'restore') {
  if (!source || !existsSync(`${source}/thei.db`)) {
    console.error(
      'Usage: bun scripts/realdata.ts restore <backup-dir> [--replace]',
    );
    console.error('The directory must hold thei.db and thei.config.json.');
    process.exit(2);
  }
  if (existsSync(content)) {
    if (!process.argv.includes('--replace')) {
      console.error(`${content} exists; pass --replace to overwrite it.`);
      process.exit(1);
    }
    rmSync(content, { recursive: true, force: true });
  }
  cpSync(source, content, { recursive: true });
  // Served here, not at the address it was published at: links, canonical
  // addresses and the MCP endpoint all follow `siteUrl`.
  const configPath = `${content}/thei.config.json`;
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  config.siteUrl = origin;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Copied into ${content}; siteUrl is ${origin}.`);
} else if (command === 'sign-in') {
  const token = randomBytes(32).toString('base64url');
  const db = new Database(`${content}/thei.db`);
  const now = Date.now();
  db.prepare(
    'INSERT INTO `sign-in-links` (tokenHash, createdAt, expiresAt, createdFrom) VALUES (?, ?, ?, ?)',
  ).run(
    createHash('sha256').update(token).digest('hex'),
    now,
    now + 10 * 60 * 1000,
    'scripts/realdata.ts',
  );
  db.close();
  console.log(`${origin}/sign-in/link/${token}/`);
} else {
  console.error('Usage: bun scripts/realdata.ts <restore|sign-in> …');
  process.exit(2);
}
