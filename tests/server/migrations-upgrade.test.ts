import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baselineSql, migrationRegistry } from '../../update/migrations';
import { runPendingMigrations, seedLedger } from '../../update/migrations/run';
import { schema_0_0_1 } from './fixtures/schema-0.0.1';
import { migrations_0_0_2, schema_0_0_2 } from './fixtures/schema-0.0.2';
import { migrations_0_0_3, schema_0_0_3 } from './fixtures/schema-0.0.3';

/**
 * The upgrade every existing site takes: a database and a config exactly as
 * Thei 0.0.1 left them, holding the kinds of rows the 0.0.2 migrations move,
 * merge or reshape, brought forward by the whole registry.
 */

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/**
 * The schema as a comparable structure. Column order is left out: SQLite
 * appends a column added later, while a fresh table lists it where the
 * schema declares it.
 */
function describeSchema(rawDb: Database.Database) {
  const tables = (
    rawDb
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%' AND name != '_thei_migrations'
         ORDER BY name`,
      )
      .all() as { name: string }[]
  ).map(({ name }) => name);
  const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
  return Object.fromEntries(
    tables.map((table) => [
      table,
      {
        columns: (rawDb.pragma(`table_info(${quote(table)})`) as ColumnInfo[])
          .map((column) => ({ ...column, cid: undefined }))
          .sort((left, right) => left.name.localeCompare(right.name)),
        foreignKeys: (
          rawDb.pragma(`foreign_key_list(${quote(table)})`) as Record<
            string,
            unknown
          >[]
        )
          .map(({ id: _id, seq: _seq, ...key }) => key)
          .sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right)),
          ),
        indexes: (
          rawDb.pragma(`index_list(${quote(table)})`) as {
            name: string;
            unique: number;
            origin: string;
          }[]
        )
          .filter((index) => index.origin === 'c')
          .map((index) => ({
            name: index.name,
            unique: index.unique,
            columns: (
              rawDb.pragma(`index_info(${quote(index.name)})`) as {
                name: string;
              }[]
            ).map((column) => column.name),
          }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      },
    ]),
  );
}

let directory: string;
let rawDb: Database.Database;
const contentPath = (...parts: string[]) => join(directory, ...parts);

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-upgrade-'));
  rawDb = new Database(contentPath('thei.db'));
});

afterEach(async () => {
  rawDb.close();
  await rm(directory, { recursive: true, force: true });
});

/** A database as a 0.0.1 site left it: its schema, its ledger, some rows. */
async function createSite_0_0_1() {
  for (const statement of schema_0_0_1) rawDb.prepare(statement).run();
  seedLedger(rawDb, migrationRegistry.slice(0, 1));

  const insert = (table: string, row: Record<string, unknown>) =>
    rawDb
      .prepare(
        `INSERT INTO \`${table}\` (${Object.keys(row)
          .map((key) => `\`${key}\``)
          .join(', ')}) VALUES (${Object.keys(row)
          .map(() => '?')
          .join(', ')})`,
      )
      .run(...Object.values(row));
  const now = Date.UTC(2026, 8, 1);

  insert('profiles', { profileId: 'profile', displayName: 'Owner' });
  insert('profile-statuses', {
    id: 'status-1',
    kind: 'regular',
    text: 'Writing a thesis',
    createdAt: now,
  });
  for (const [projectUuid, publicId] of [
    ['project-a', 'pa'],
    ['project-b', 'pb'],
  ])
    insert('projects', {
      projectUuid,
      title: projectUuid,
      summary: '',
      access: 'public',
      humanReadableSlug: projectUuid,
      publicId,
      createdAt: now,
      updatedAt: now,
    });
  insert('events', {
    eventUuid: 'event-a',
    title: 'Event',
    summary: '',
    access: 'public',
    humanReadableSlug: 'event',
    publicId: 'ea',
    createdAt: now,
    updatedAt: now,
  });
  insert('project-relations', {
    firstProjectUuid: 'project-b',
    secondProjectUuid: 'project-a',
    type: 'first-influences-second',
    note: JSON.stringify({
      type: 'split',
      firstProjectText: 'b about a',
      secondProjectText: 'a about b',
    }),
    firstSortOrder: 0,
    secondSortOrder: 0,
  });
  insert('event-project-relations', {
    eventUuid: 'event-a',
    projectUuid: 'project-a',
    note: 'shared note',
    sortOrder: 0,
  });
  insert('project-stages', {
    stageUuid: 'stage-a',
    projectUuid: 'project-a',
    title: 'Stage',
    humanReadableSlug: 'stage',
    publicId: 'sa',
    createdAt: now,
    updatedAt: now,
  });
  insert('stage-periods', {
    stageType: 'project-stage',
    stageUuid: 'stage-a',
    sortOrder: 0,
    startDate: '2026-01-01',
    endDate: '2026-02-01',
  });
  for (const [tagUuid, title] of [
    ['tag-1', 'Ёлка'],
    ['tag-2', 'Елка'],
    ['tag-3', 'Product  design'],
  ])
    insert('tags', {
      tagUuid,
      title,
      normalizedTitle: title.normalize('NFKC').toLocaleLowerCase(),
      slug: tagUuid,
      publicId: tagUuid,
      accentColor: '#ff0000',
    });
  insert('tag-usages', {
    tagUuid: 'tag-1',
    containerType: 'project',
    containerId: 'project-a',
    sortOrder: 0,
  });
  insert('tag-usages', {
    tagUuid: 'tag-2',
    containerType: 'project',
    containerId: 'project-b',
    sortOrder: 0,
  });
  insert('external-links', {
    url: 'https://example.com/',
    title: 'Example',
    faviconKey: 'key',
    touchedAt: now,
  });
  insert('project-external-links', {
    projectUuid: 'project-a',
    url: 'https://example.com/',
    name: 'Where it all began',
    sortOrder: 0,
  });
  insert('event-external-links', {
    eventUuid: 'event-a',
    url: 'https://example.com/',
    name: 'Example',
    sortOrder: 0,
  });

  await writeFile(
    contentPath('thei.config.json'),
    JSON.stringify({
      version: '0.0.1',
      languageCode: 'en',
      siteAccessLevel: 'public',
      siteUrl: '',
      secretPhrase: 'phrase',
      password: { hash: 'h', salt: 's', iterations: 1 },
      backup: { token: 'backup-token', createdAt: '2026-09-01T00:00:00Z' },
    }),
  );
}

describe('upgrading a 0.0.1 site', () => {
  it('ends with the schema a new installation starts from', async () => {
    await createSite_0_0_1();
    await runPendingMigrations(rawDb, { contentPath });

    const fresh = new Database(':memory:');
    try {
      for (const statement of baselineSql) fresh.prepare(statement).run();
      expect(describeSchema(rawDb)).toEqual(describeSchema(fresh));
    } finally {
      fresh.close();
    }
  });

  it('carries the content over', async () => {
    await createSite_0_0_1();
    await runPendingMigrations(rawDb, { contentPath });
    const all = (query: string) => rawDb.prepare(query).all();

    // Dated by the day it has always been shown under.
    expect(all('SELECT ownerType, ownerId, text, date FROM statuses')).toEqual([
      {
        ownerType: 'profile',
        ownerId: 'profile',
        text: 'Writing a thesis',
        date: '2026-09-01',
      },
    ]);

    // Stored once, smaller `type:id` first, direction and notes turned with it.
    expect(
      all(
        'SELECT firstType, firstId, secondType, secondId, type, note FROM `entity-relations` ORDER BY secondType, secondId',
      ),
    ).toEqual([
      {
        firstType: 'event',
        firstId: 'event-a',
        secondType: 'project',
        secondId: 'project-a',
        type: 'related',
        note: JSON.stringify({ type: 'shared', text: 'shared note' }),
      },
      {
        firstType: 'project',
        firstId: 'project-a',
        secondType: 'project',
        secondId: 'project-b',
        type: 'second-influences-first',
        note: JSON.stringify({
          type: 'split',
          firstText: 'a about b',
          secondText: 'b about a',
        }),
      },
    ]);

    // «Ёлка» and «Елка» are one tag now, and titles are stored clean.
    expect(
      all('SELECT title, normalizedTitle FROM tags ORDER BY normalizedTitle'),
    ).toEqual([
      { title: 'Product design', normalizedTitle: 'product design' },
      { title: 'Ёлка', normalizedTitle: 'елка' },
    ]);
    expect(
      all('SELECT containerId FROM `tag-usages` ORDER BY containerId'),
    ).toEqual([{ containerId: 'project-a' }, { containerId: 'project-b' }]);

    // A period made before labels existed is simply unnamed.
    expect(
      all('SELECT startDate, endDate, precision, label FROM `stage-periods`'),
    ).toEqual([
      {
        startDate: '2026-01-01',
        endDate: '2026-02-01',
        precision: 'exact',
        label: '',
      },
    ]);

    // A link's own name is its note now; one repeating the site's title goes.
    expect(all('SELECT url, note FROM `project-external-links`')).toEqual([
      { url: 'https://example.com/', note: 'Where it all began' },
    ]);
    expect(all('SELECT url, note FROM `event-external-links`')).toEqual([
      { url: 'https://example.com/', note: '' },
    ]);
  });

  it('brings the config to the shape this release reads', async () => {
    await createSite_0_0_1();
    await runPendingMigrations(rawDb, { contentPath });

    const config = JSON.parse(
      await readFile(contentPath('thei.config.json'), 'utf8'),
    );
    expect(config.analytics).toEqual({
      googleTagId: '',
      googleSiteVerification: '',
      yandexMetrikaId: '',
      yandexVerification: '',
    });
    expect(config.siteUrl).toBe('');
    // Installed clients keep sending the token; only its hash is kept.
    expect(config.backup).toEqual({
      tokenHash: createHash('sha256').update('backup-token').digest('hex'),
      createdAt: '2026-09-01T00:00:00Z',
    });
  });
});

describe('upgrading a 0.0.2 site', () => {
  it('ends with the schema a new installation starts from', async () => {
    for (const statement of schema_0_0_2) rawDb.prepare(statement).run();
    seedLedger(
      rawDb,
      migrationRegistry.filter(({ id }) => migrations_0_0_2.includes(id)),
    );
    await runPendingMigrations(rawDb, { contentPath });

    const fresh = new Database(':memory:');
    try {
      for (const statement of baselineSql) fresh.prepare(statement).run();
      expect(describeSchema(rawDb)).toEqual(describeSchema(fresh));
    } finally {
      fresh.close();
    }
  });
});

describe('upgrading a 0.0.3 site', () => {
  it('ends with the schema a new installation starts from', async () => {
    for (const statement of schema_0_0_3) rawDb.prepare(statement).run();
    seedLedger(
      rawDb,
      migrationRegistry.filter(({ id }) => migrations_0_0_3.includes(id)),
    );
    await runPendingMigrations(rawDb, { contentPath });

    const fresh = new Database(':memory:');
    try {
      for (const statement of baselineSql) fresh.prepare(statement).run();
      expect(describeSchema(rawDb)).toEqual(describeSchema(fresh));
    } finally {
      fresh.close();
    }
  });
});
