import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharedLinkFavicons from '../../update/migrations/0.0.3-shared-link-favicons';
import type { MigrationContext } from '../../update/migrations/types';

let rawDb: Database.Database;
let content: string;

const directory = () => join(content, 'external-link-favicons');
const sha256 = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

const context = (): MigrationContext => ({
  rawDb,
  contentPath: (...parts) => join(content, ...parts),
  readConfig: async () => ({}),
  writeConfig: async () => {},
  log: () => {},
});

/** A link as an older release stored it: its icon named after its address. */
function insertLink(url: string, icon?: string) {
  const key = sha256(url);
  rawDb
    .prepare(
      'INSERT INTO `external-links` (url, faviconKey, touchedAt) VALUES (?, ?, 0)',
    )
    .run(url, key);
  if (icon !== undefined) writeFileSync(join(directory(), `${key}.webp`), icon);
  return key;
}

const keyOf = (url: string) =>
  (
    rawDb
      .prepare('SELECT faviconKey FROM `external-links` WHERE url = ?')
      .get(url) as { faviconKey: string }
  ).faviconKey;

const migrate = () =>
  rawDb.transaction(() => sharedLinkFavicons.up!(context()))();

beforeEach(() => {
  content = mkdtempSync(join(tmpdir(), 'thei-link-favicons-'));
  mkdirSync(directory());
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE \`external-links\` (
      \`url\` text PRIMARY KEY NOT NULL,
      \`title\` text,
      \`description\` text,
      \`faviconKey\` text NOT NULL,
      \`accent\` text,
      \`status\` text DEFAULT 'complete' NOT NULL,
      \`touchedAt\` integer NOT NULL
    );
  `);
});

afterEach(() => {
  rawDb.close();
  rmSync(content, { recursive: true, force: true });
});

describe('shared link favicons migration', () => {
  it('points links with the same icon at one file named after its bytes', () => {
    const oldA = insertLink('https://store.example/app/1/', 'store icon');
    const oldB = insertLink('https://store.example/app/2/', 'store icon');
    insertLink('https://other.example/', 'other icon');

    migrate();

    expect(keyOf('https://store.example/app/1/')).toBe(sha256('store icon'));
    expect(keyOf('https://store.example/app/2/')).toBe(sha256('store icon'));
    expect(keyOf('https://other.example/')).toBe(sha256('other icon'));
    expect(existsSync(join(directory(), `${sha256('store icon')}.webp`))).toBe(
      true,
    );
    // Copied, never moved: the old names are the sweep's to remove.
    expect(existsSync(join(directory(), `${oldA}.webp`))).toBe(true);
    expect(existsSync(join(directory(), `${oldB}.webp`))).toBe(true);
  });

  it('leaves a link whose file is missing as it was', () => {
    const key = insertLink('https://gone.example/');
    migrate();
    expect(keyOf('https://gone.example/')).toBe(key);
  });

  it('changes nothing when run again', () => {
    insertLink('https://store.example/', 'store icon');
    migrate();
    const files = readdirSync(directory()).sort();
    migrate();
    expect(keyOf('https://store.example/')).toBe(sha256('store icon'));
    expect(readdirSync(directory()).sort()).toEqual(files);
  });
});
