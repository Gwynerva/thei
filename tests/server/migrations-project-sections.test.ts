import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrationRegistry } from '../../update/migrations';
import { runPendingMigrations, seedLedger } from '../../update/migrations/run';
import { migrations_0_0_3, schema_0_0_3 } from './fixtures/schema-0.0.3';

/**
 * A 0.0.3 site with stages, sections and every place a stage is named by its
 * kind or its address, brought through 0.0.4: each stage must become a
 * section with everything it had, and every link to it must follow.
 */

let directory: string;
let rawDb: Database.Database;
const contentPath = (...parts: string[]) => join(directory, ...parts);

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-sections-'));
  rawDb = new Database(contentPath('thei.db'));
  rawDb.pragma('foreign_keys = ON');
  for (const statement of schema_0_0_3) rawDb.prepare(statement).run();
  seedLedger(
    rawDb,
    migrationRegistry.filter(({ id }) => migrations_0_0_3.includes(id)),
  );
});

afterEach(async () => {
  rawDb.close();
  await rm(directory, { recursive: true, force: true });
});

function insert(table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  rawDb
    .prepare(
      `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    )
    .run(
      ...columns.map((column) => {
        const value = row[column];
        return value !== null && typeof value === 'object'
          ? JSON.stringify(value)
          : value;
      }),
    );
}

const all = <T = Record<string, unknown>>(sql: string, ...params: unknown[]) =>
  rawDb.prepare(sql).all(...params) as T[];

const anchor = (type: string, id: string) =>
  `<a data-content-link="entity" data-entity-type="${type}" data-entity-id="${id}">`;

const ownStageUrl =
  'https://site.example/base/projects/atlas-Pone/stages/x-Sa/';

function project(projectUuid: string, publicId: string, action?: object) {
  insert('projects', {
    projectUuid,
    title: projectUuid,
    summary: '',
    access: 'public',
    humanReadableSlug: 'atlas',
    publicId,
    ...(action ? { action } : {}),
    createdAt: 1,
    updatedAt: 1,
  });
}

function section(
  sectionUuid: string,
  projectUuid: string,
  publicId: string,
  sortOrder: number,
) {
  insert('project-content-sections', {
    sectionUuid,
    projectUuid,
    title: sectionUuid,
    humanReadableSlug: sectionUuid,
    publicId,
    sortOrder,
    createdAt: 1,
    updatedAt: 1,
  });
}

function stage(
  stageUuid: string,
  publicId: string,
  periods: [string, string][],
  createdAt: number,
) {
  insert('project-stages', {
    stageUuid,
    projectUuid: 'P1',
    title: `Stage ${stageUuid}`,
    summary: 'What happened',
    humanReadableSlug: 'stage',
    publicId,
    isPrivate: stageUuid === 'st-early' ? 1 : 0,
    createdAt,
    updatedAt: createdAt + 10,
  });
  periods.forEach(([startDate, endDate], sortOrder) =>
    insert('stage-periods', {
      stageType: 'project-stage',
      stageUuid,
      sortOrder,
      startDate,
      endDate,
    }),
  );
}

function body(
  contentUuid: string,
  ownerType: string,
  ownerId: string,
  slot: string,
  blocks: object[],
) {
  insert('content', {
    contentUuid,
    ownerType,
    ownerId,
    slot,
    data: { blocks },
    createdAt: 1,
    updatedAt: 1,
  });
}

function draft(id: string, ownerRef: string, blocks: object[]) {
  insert('content-history', {
    id,
    ownerType: 'project-stage',
    ownerRef,
    slot: 'project-stage-body',
    kind: 'draft',
    data: { blocks },
    digest: 'digest',
    wordCount: 1,
    blockCount: blocks.length,
    assetCount: 0,
    size: 1,
    assetUuids: [],
    createdAt: 1,
    updatedAt: 1,
  });
}

function seedSite() {
  project('P1', 'Pone');
  project('P2', 'Ptwo', {
    target: 'external-link',
    externalUrl: 'https://site.example/projects/atlas-Pone/stages/late-Tlate/',
  });
  section('sec-a', 'P1', 'Sa', 0);
  section('sec-b', 'P1', 'Sb', 1);
  section('shared-uuid', 'P2', 'Sx', 0);
  // Created first, but its period comes last.
  stage('st-late', 'Tlate', [['2025-06-01', '2025-06-30']], 100);
  // No body; two periods, the first of them the earliest of all.
  stage(
    'st-early',
    'Tearly',
    [
      ['2024-01-01', '2024-02-01'],
      ['2026-01-01', '2026-01-10'],
    ],
    200,
  );
  // Collides with a section by uuid and, in its own project, by public ID.
  stage('shared-uuid', 'Sa', [['2025-01-01', '2025-01-01']], 300);
  insert('events', {
    eventUuid: 'E1',
    title: 'Event',
    summary: '',
    access: 'public',
    humanReadableSlug: 'event',
    publicId: 'Eone',
    createdAt: 1,
    updatedAt: 1,
  });
  insert('stage-periods', {
    stageType: 'event-stage',
    stageUuid: 'E1',
    sortOrder: 0,
    startDate: '2023-01-01',
    endDate: '2023-01-05',
  });
  body('c-late', 'project-stage', 'st-late', 'project-stage-body', [
    { type: 'paragraph', data: { text: 'Late body' } },
  ]);
  body('c-shared', 'project-stage', 'shared-uuid', 'project-stage-body', [
    { type: 'paragraph', data: { text: 'Shared body' } },
  ]);
  body('c-section', 'project-section', 'shared-uuid', 'project-section-body', [
    { type: 'paragraph', data: { text: 'The section of P2' } },
  ]);
  body('c-event', 'event', 'E1', 'event-body', [
    {
      type: 'paragraph',
      data: {
        text: `See ${anchor('project-stage', 'st-late')}late</a>, ${anchor('project-stage', 'shared-uuid')}the stage</a> and ${anchor('project-section', 'shared-uuid')}the section</a>.`,
      },
    },
    {
      type: 'entityLink',
      data: { entityType: 'project-stage', entityId: 'st-early' },
    },
    {
      type: 'paragraph',
      data: {
        text: 'Typed: &lt;a data-entity-type="project-stage"&gt; and /projects/atlas-Pone/stages/late-Tlate/',
      },
    },
    {
      type: 'paragraph',
      data: {
        text: `<a href="/projects/atlas-Pone/stages/late-Tlate/">relative</a>, <a href="${ownStageUrl}" data-content-link="external">absolute</a>, <a href="https://other.example/projects/nope-Zzz/stages/a-Tlate/" data-content-link="external">foreign</a>`,
      },
    },
    { type: 'externalLink', data: { url: ownStageUrl, note: 'Ours' } },
    {
      type: 'externalLink',
      data: {
        url: 'https://other.example/',
        note: `${anchor('project-stage', 'not-a-stage')} typed into a note`,
      },
    },
  ]);
  draft('h-saved', 'st-late', [
    {
      type: 'paragraph',
      data: { text: `Draft ${anchor('project-stage', 'st-early')}x</a>` },
    },
  ]);
  draft('h-new', 'new~abc', [{ type: 'paragraph', data: { text: 'New' } }]);
  insert('external-links', {
    url: ownStageUrl,
    title: 'Stage page',
    faviconKey: 'key',
    status: 'complete',
    touchedAt: 1,
  });
  insert('project-external-links', {
    projectUuid: 'P1',
    url: ownStageUrl,
    sortOrder: 0,
    note: 'Our own stage',
  });
  insert('profile-external-links', {
    url: ownStageUrl,
    name: 'Stage',
    sortOrder: 0,
  });
}

describe('turning stages into sections', () => {
  it('keeps every stage as a section, after the sections, by its first period', async () => {
    seedSite();
    const logged: string[] = [];
    await runPendingMigrations(rawDb, {
      contentPath,
      log: (message: string) => logged.push(message),
    } as never);

    const sections = all<Record<string, unknown>>(
      'SELECT * FROM `project-content-sections` WHERE projectUuid = ? ORDER BY sortOrder',
      'P1',
    );
    const clash = sections.find((row) => row.title === 'Stage shared-uuid')!;
    expect(sections.map((row) => [row.sectionUuid, row.sortOrder])).toEqual([
      ['sec-a', 0],
      ['sec-b', 1],
      ['st-early', 2],
      [clash.sectionUuid, 3],
      ['st-late', 4],
    ]);
    expect(clash.sectionUuid).toMatch(/^pcs-/);
    expect(clash.publicId).not.toBe('Sa');
    expect(clash.publicId).toMatch(/^[A-Za-z0-9]{14}$/);
    expect(sections.find((row) => row.sectionUuid === 'st-early')).toEqual({
      sectionUuid: 'st-early',
      projectUuid: 'P1',
      title: 'Stage st-early',
      summary: 'What happened',
      humanReadableSlug: 'stage',
      publicId: 'Tearly',
      isPrivate: 1,
      sortOrder: 2,
      createdAt: 200,
      updatedAt: 210,
    });
    // The section the stage collided with is untouched.
    expect(
      all(
        'SELECT sectionUuid, publicId FROM `project-content-sections` WHERE projectUuid = ?',
        'P2',
      ),
    ).toEqual([{ sectionUuid: 'shared-uuid', publicId: 'Sx' }]);

    expect(
      all(
        'SELECT ownerType, ownerId, sortOrder, startDate, endDate, label FROM periods ORDER BY ownerType, ownerId, sortOrder',
      ),
    ).toEqual(
      [
        ['event', 'E1', 0, '2023-01-01', '2023-01-05'],
        ['project-section', clash.sectionUuid, 0, '2025-01-01', '2025-01-01'],
        ['project-section', 'st-early', 0, '2024-01-01', '2024-02-01'],
        ['project-section', 'st-early', 1, '2026-01-01', '2026-01-10'],
        ['project-section', 'st-late', 0, '2025-06-01', '2025-06-30'],
      ]
        .sort((left, right) =>
          `${left[0]}${left[1]}${left[2]}`.localeCompare(
            `${right[0]}${right[1]}${right[2]}`,
          ),
        )
        .map(([ownerType, ownerId, sortOrder, startDate, endDate]) => ({
          ownerType,
          ownerId,
          sortOrder,
          startDate,
          endDate,
          label: '',
        })),
    );

    expect(
      all(
        'SELECT name FROM sqlite_master WHERE type = ? AND name IN (?, ?)',
        'table',
        'project-stages',
        'stage-periods',
      ),
    ).toEqual([]);
    expect(logged.join('\n')).toContain('Turned 3 stages into sections');
  });

  it('moves the bodies and drafts of stages to their sections', async () => {
    seedSite();
    await runPendingMigrations(rawDb, { contentPath });
    const clash = all<{ sectionUuid: string }>(
      'SELECT sectionUuid FROM `project-content-sections` WHERE title = ?',
      'Stage shared-uuid',
    )[0]!.sectionUuid;

    expect(
      all(
        'SELECT contentUuid, ownerType, ownerId, slot FROM content WHERE contentUuid != ? ORDER BY contentUuid',
        'c-event',
      ),
    ).toEqual([
      {
        contentUuid: 'c-late',
        ownerType: 'project-section',
        ownerId: 'st-late',
        slot: 'project-section-body',
      },
      {
        contentUuid: 'c-section',
        ownerType: 'project-section',
        ownerId: 'shared-uuid',
        slot: 'project-section-body',
      },
      {
        contentUuid: 'c-shared',
        ownerType: 'project-section',
        ownerId: clash,
        slot: 'project-section-body',
      },
    ]);
    expect(
      all(
        'SELECT id, ownerType, ownerRef, slot FROM `content-history` ORDER BY id',
      ),
    ).toEqual([
      {
        id: 'h-new',
        ownerType: 'project-section',
        ownerRef: 'new~abc',
        slot: 'project-section-body',
      },
      {
        id: 'h-saved',
        ownerType: 'project-section',
        ownerRef: 'st-late',
        slot: 'project-section-body',
      },
    ]);
    const draftText = JSON.parse(
      all<{ data: string }>(
        'SELECT data FROM `content-history` WHERE id = ?',
        'h-saved',
      )[0]!.data,
    ).blocks[0].data.text;
    expect(draftText).toBe(
      `Draft ${anchor('project-section', 'st-early')}x</a>`,
    );
  });

  it('points every link to a stage at the section it became, and nothing else', async () => {
    seedSite();
    await runPendingMigrations(rawDb, { contentPath });
    const clash = all<{ sectionUuid: string; publicId: string }>(
      'SELECT sectionUuid, publicId FROM `project-content-sections` WHERE title = ?',
      'Stage shared-uuid',
    )[0]!;
    const ownSectionUrl = `https://site.example/base/projects/atlas-Pone/sections/x-${clash.publicId}/`;
    const blocks = JSON.parse(
      all<{ data: string }>(
        'SELECT data FROM content WHERE contentUuid = ?',
        'c-event',
      )[0]!.data,
    ).blocks;

    expect(blocks[0].data.text).toBe(
      `See ${anchor('project-section', 'st-late')}late</a>, ${anchor('project-section', clash.sectionUuid)}the stage</a> and ${anchor('project-section', 'shared-uuid')}the section</a>.`,
    );
    expect(blocks[1].data).toEqual({
      entityType: 'project-section',
      entityId: 'st-early',
    });
    // What the owner typed stays as typed, even where it reads like a link.
    expect(blocks[2].data.text).toBe(
      'Typed: &lt;a data-entity-type="project-stage"&gt; and /projects/atlas-Pone/stages/late-Tlate/',
    );
    expect(blocks[3].data.text).toBe(
      `<a href="/projects/atlas-Pone/sections/late-Tlate/">relative</a>, <a href="${ownSectionUrl}" data-content-link="external">absolute</a>, <a href="https://other.example/projects/nope-Zzz/stages/a-Tlate/" data-content-link="external">foreign</a>`,
    );
    expect(blocks[4].data).toEqual({ url: ownSectionUrl, note: 'Ours' });
    expect(blocks[5].data.note).toBe(
      `${anchor('project-stage', 'not-a-stage')} typed into a note`,
    );

    expect(all('SELECT url, title FROM `external-links`')).toEqual([
      { url: ownSectionUrl, title: 'Stage page' },
    ]);
    expect(all('SELECT url, note FROM `project-external-links`')).toEqual([
      { url: ownSectionUrl, note: 'Our own stage' },
    ]);
    expect(all('SELECT url FROM `profile-external-links`')).toEqual([
      { url: ownSectionUrl },
    ]);
    expect(
      JSON.parse(
        all<{ action: string }>(
          'SELECT action FROM projects WHERE projectUuid = ?',
          'P2',
        )[0]!.action,
      ),
    ).toEqual({
      target: 'external-link',
      externalUrl:
        'https://site.example/projects/atlas-Pone/sections/late-Tlate/',
    });
  });
});
