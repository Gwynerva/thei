import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { H3Event } from 'h3';
import { DEFAULT_AI_MODEL } from '../../shared/ai-model';
import { AI_ANCHOR_MEMORY_MAX } from '../../shared/ai';
import { createSession } from '../../server/thei/ai/sessions/store';
import {
  proposeActions,
  type ActionProposal,
} from '../../server/thei/ai/actions/propose';
import { applyActions } from '../../server/thei/ai/actions/apply';
import { undoAction, undoState } from '../../server/thei/ai/actions/undo';
import { findAction } from '../../server/thei/ai/actions/rows';
import { addMemory, anchorRows } from '../../server/thei/ai/memory/store';
import { memoryLines } from '../../server/thei/ai/memory/read';
import { memoryIndex } from '../../server/thei/ai/memory/index';
import {
  findTerm,
  keptWordsIn,
  saveTerm,
  termItems,
  termsIn,
} from '../../server/thei/ai/terms';
import { digestOf, writeDigest } from '../../server/thei/ai/digests';
import { deleteDiaryEntry } from '../../server/thei/diary/edit';
import { setTheiConfig, theiConfig } from '../../server/thei/config/index';
import { directTools } from '../../server/thei/mcp/registry';
import { invalidateMcpDocuments } from '../../server/thei/mcp/documents';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * What the AI keeps besides sessions: memory anchored to what it is about
 * and read only with it, the owner's dictionary, and a model's digests of
 * entities kept while they read the same. Remembered by actions the owner
 * applies and takes back, by hand, and gone with what it was about.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;
let folder: string;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const EVENT = 'e-33333333-3333-4333-8333-333333333333';
const DIARY = 'd-1';
const project = { kind: 'project' as const, id: PROJECT };
const diary = { kind: 'diary-entry' as const, id: DIARY, date: '2026-10-13' };

beforeEach(async () => {
  context = await freshTestDb();
  folder = await mkdtemp(join(tmpdir(), 'thei-ai-memory-'));
  Object.assign(context.server, {
    useDb: () => context,
    version: '0.0.6',
    contentPath: (...parts: string[]) => join(folder, ...parts),
    console: { log() {}, warn() {}, error() {} },
    ...serverRepositories,
  });
  // The settings as the site holds them: a write is read back at once.
  setTheiConfig({
    version: '0.0.6',
    siteUrl: 'https://example.test',
    languageCode: 'en',
    mcp: {
      enabled: true,
      instructions: 'I write in the first person.',
      model: { ...DEFAULT_AI_MODEL },
      monthlyTokens: 10_000_000,
    },
  } as never);
  Object.defineProperty(context.server, 'config', {
    configurable: true,
    get: () => theiConfig,
  });
  Object.assign(globalThis, {
    useRuntimeConfig: () => ({ app: { baseURL: '/' } }),
  });
  const insert = (table: string, row: Record<string, unknown>) =>
    context.rawDb
      .prepare(
        `INSERT INTO \`${table}\` (${Object.keys(row)
          .map((key) => `\`${key}\``)
          .join(', ')}) VALUES (${Object.keys(row)
          .map(() => '?')
          .join(', ')})`,
      )
      .run(
        ...Object.values(row).map((value) =>
          value !== null && typeof value === 'object'
            ? JSON.stringify(value)
            : value,
        ),
      );
  insert('profiles', { profileId: 'profile', displayName: 'Owner' });
  insert('projects', {
    projectUuid: PROJECT,
    title: 'Parapet',
    summary: 'A browser remake',
    access: 'public',
    humanReadableSlug: 'parapet',
    publicId: 'Parapet',
    createdAt: 1,
    updatedAt: 2,
  });
  insert('events', {
    eventUuid: EVENT,
    title: 'Night of lanterns',
    summary: 'A night',
    access: 'public',
    humanReadableSlug: 'night',
    publicId: 'Night1',
    createdAt: 1,
    updatedAt: 2,
  });
  insert('diary-entries', {
    diaryUuid: DIARY,
    date: '2026-10-13',
    access: 'public',
    createdAt: 1,
    updatedAt: 4,
  });
  insert('content', {
    contentUuid: 'c-2',
    ownerType: 'diary-entry',
    ownerId: DIARY,
    slot: 'diary-body',
    data: {
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          data: { text: 'Went to the Kuzova islands with Lyosha today.' },
        },
      ],
    },
    createdAt: 1,
    updatedAt: 5,
  });
  invalidateMcpDocuments();
});

afterEach(async () => {
  await context.close();
  await rm(folder, { recursive: true, force: true });
});

const one = (sql: string, ...params: unknown[]) =>
  context.rawDb.prepare(sql).get(...params) as Record<string, any> | undefined;

async function applied(...actions: ActionProposal[]) {
  const sessionUuid = createSession({ origin: 'owner', title: 'Memory' });
  const { results } = await proposeActions({ sessionUuid, actions });
  const ids = results.map((result) => {
    if ('refused' in result) throw new Error(result.refused);
    return result.actionUuid;
  });
  const outcome = await applyActions({ actionUuids: ids, by: 'owner' });
  expect(outcome.failed).toBeUndefined();
  return ids;
}

async function refused(action: ActionProposal) {
  const sessionUuid = createSession({ origin: 'owner', title: 'Memory' });
  const { results } = await proposeActions({ sessionUuid, actions: [action] });
  return 'refused' in results[0]! ? results[0].refused : '';
}

const tools = () =>
  Object.fromEntries(
    directTools({
      event: {} as H3Event,
      principal: { tokenUuid: 'tk-test', label: 'Test', scopes: ['read'] },
    }).map((tool) => [tool.name, tool]),
  );

async function toolText(name: string, args: unknown) {
  const result = await tools()[name]!.call(args);
  return result.content
    .map((part) => ('text' in part ? part.text : ''))
    .join('\n');
}

describe('memory', () => {
  it('is remembered with what it is about, and read only with it', async () => {
    await applied(
      {
        kind: 'remember',
        target: `project:${PROJECT}`,
        text: 'The level editor came first.',
      },
      {
        kind: 'remember',
        target: `project:${PROJECT}`,
        other: 'diary-entry:2026-10-13',
        text: 'The trip was not about the game.',
      },
      {
        kind: 'remember',
        entityKind: 'diary-entry',
        text: 'Dates are as written, never recounted.',
      },
    );
    const aboutProject = memoryLines(project).join('\n');
    expect(aboutProject).toContain('The level editor came first.');
    expect(aboutProject).toContain(
      'with diary-entry:2026-10-13 (2026-10-13): The trip was not about the game.',
    );
    // A kind's record is read with each of its entities, not with others.
    expect(aboutProject).not.toContain('Dates are as written');
    const aboutDay = memoryLines(diary).join('\n');
    expect(aboutDay).toContain('every diary-entry: Dates are as written');
    expect(aboutDay).toContain('The trip was not about the game.');
    expect(aboutDay).not.toContain('level editor');

    const read = await toolText('read_entity', { ref: `project:${PROJECT}` });
    expect(read).toContain('## What the owner asked to remember about it');
    expect(read).toContain('It has no digest yet');
  });

  it('refuses a fact past the limit and offers to compact, which is undone whole', async () => {
    const entity = { anchor: 'entity' as const, entity: project };
    const fact = 'x'.repeat(390);
    addMemory(entity, { text: `A ${fact}` });
    addMemory(entity, { text: `B ${fact}` });
    addMemory(entity, { text: `C ${fact}` });
    expect(
      await refused({
        kind: 'remember',
        target: `project:${PROJECT}`,
        text: 'One more thing to keep in mind about it.',
      }),
    ).toMatch(/memory-compact/);

    const [compact] = await applied({
      kind: 'memory-compact',
      target: `project:${PROJECT}`,
      facts: ['A, B and C, said shortly.'],
    });
    expect(anchorRows(entity).map((row) => row.text)).toEqual([
      'A, B and C, said shortly.',
    ]);
    expect(await undoState(findAction(compact!)!)).toBe('ready');
    await undoAction(compact!);
    expect(anchorRows(entity).map((row) => row.text[0])).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(
      anchorRows(entity).reduce((sum, row) => sum + row.text.length, 0),
    ).toBeLessThanOrEqual(AI_ANCHOR_MEMORY_MAX);
  });

  it('remembers about the owner into «about you», and takes it back', async () => {
    const [action] = await applied({
      kind: 'remember',
      about: 'owner',
      text: 'Lyosha is my brother.',
    });
    const instructions = () => theiConfig!.mcp.instructions;
    expect(instructions()).toBe(
      'I write in the first person.\n\nLyosha is my brother.',
    );
    await undoAction(action!);
    expect(instructions()).toBe('I write in the first person.');
  });

  it('is gone with what it was about, a pair with either end', async () => {
    const pair = {
      anchor: 'pair' as const,
      entity: project,
      other: diary,
    };
    addMemory(pair, { text: 'Not the same trip.' });
    addMemory({ anchor: 'entity', entity: diary }, { text: 'A good day.' });
    addMemory({ anchor: 'entity', entity: project }, { text: 'Stays.' });
    writeDigest(diary, 'A trip to the islands.', 'test');
    await deleteDiaryEntry({ diaryUuid: DIARY } as never);
    expect(one('SELECT count(*) AS n FROM `ai-memory`')!.n).toBe(1);
    expect(one('SELECT text FROM `ai-memory`')!.text).toBe('Stays.');
    expect(one('SELECT count(*) AS n FROM `ai-digests`')!.n).toBe(0);
  });

  it('lists entities with their records, a pair under both, and finds by any word', async () => {
    addMemory(
      { anchor: 'pair', entity: project, other: diary },
      { text: 'Not the same trip.' },
    );
    addMemory({ anchor: 'entity', entity: project }, { text: 'Ёлка была.' });
    const all = await memoryIndex();
    expect(all.entityCount).toBe(2);
    expect(all.recordCount).toBe(2);
    expect(
      all.entities.map((group) => [group.entity.ref, group.items.length]),
    ).toEqual(
      expect.arrayContaining([
        [`project:${PROJECT}`, 2],
        ['diary-entry:2026-10-13', 1],
      ]),
    );
    const found = await memoryIndex({ q: 'ЕЛКА' });
    expect(found.entities.map((group) => group.entity.ref)).toEqual([
      `project:${PROJECT}`,
    ]);
    expect(found.owner.text).toBe('I write in the first person.');
  });
});

describe('the dictionary', () => {
  it('finds a word in its forms, by its stem, and keeps it from proofreading', () => {
    saveTerm({ display: 'Kuzova', note: 'Islands in the White Sea' });
    saveTerm({ display: 'Lyosha', note: 'My brother', forms: ['Lyoshka'] });
    expect(
      termsIn('We sailed to Kuzova; Lyoshka stayed.').map((t) => t.display),
    ).toEqual(['Kuzova', 'Lyosha']);
    expect(termsIn('Nothing here.')).toEqual([]);
    expect(keptWordsIn('to the Kuzova islands')).toEqual(['kuzova']);
    expect(termItems().find((t) => t.display === 'Kuzova')!.uses).toBe(1);
  });

  it('takes a word an action brings, and gives back the one it replaced', async () => {
    saveTerm({ display: 'Lyosha', note: 'A friend' });
    const [action] = await applied({
      kind: 'term',
      word: 'Lyosha',
      note: 'My brother',
    });
    expect(findTerm('lyosha')?.note).toBe('My brother');
    await undoAction(action!);
    expect(findTerm('lyosha')?.note).toBe('A friend');
    expect(
      await refused({ kind: 'term', word: 'Lyosha', note: 'A friend' }),
    ).toMatch(/has it so already/);
  });

  it('is read with a text that has its words', async () => {
    saveTerm({ display: 'Kuzova', note: 'Islands in the White Sea' });
    const read = await toolText('read_entity', {
      ref: 'diary-entry:2026-10-13',
    });
    expect(read).toContain("## Words of the owner's dictionary in it");
    expect(read).toContain(
      'Kuzova (keep as written) — Islands in the White Sea',
    );
  });
});

describe('digests', () => {
  it('stand in for an entity while it reads the same', async () => {
    expect(
      await toolText('write_digest', {
        ref: `project:${PROJECT}`,
        digest: 'A remake of a browser game, its levels first.',
      }),
    ).toContain('is kept');
    expect(digestOf(project)).toMatchObject({ fresh: true });
    expect(
      await toolText('read_digests', { refs: [`project:${PROJECT}`] }),
    ).toContain('A remake of a browser game, its levels first.');

    context.rawDb
      .prepare('UPDATE projects SET updatedAt = 99 WHERE projectUuid = ?')
      .run(PROJECT);
    invalidateMcpDocuments();
    expect(digestOf(project)).toMatchObject({ fresh: false });
    const stale = await toolText('read_digests', {
      refs: [`project:${PROJECT}`],
    });
    expect(stale).toContain('it has changed since');
    expect(stale).not.toContain('its levels first');
  });
});
