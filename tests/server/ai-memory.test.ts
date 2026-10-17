import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { H3Event } from 'h3';
import { AI_ANCHOR_MEMORY_MAX } from '../../shared/ai';
import { createSession } from '../../server/thei/ai/sessions/store';
import {
  proposeActions,
  type ActionProposal,
} from '../../server/thei/ai/actions/propose';
import {
  applyActions,
  settleActions,
} from '../../server/thei/ai/actions/apply';
import { rejectActions } from '../../server/thei/ai/actions/decide';
import { deleteTagUsagesForContainer } from '../../server/thei/tags';
import { undoAction, undoState } from '../../server/thei/ai/actions/undo';
import { findAction } from '../../server/thei/ai/actions/rows';
import {
  addMemory,
  anchorRows,
  updateMemory,
} from '../../server/thei/ai/memory/store';
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
import { theiConfig } from '../../server/thei/config/index';
import { directTools } from '../../server/thei/mcp/registry';
import { invalidateMcpDocuments } from '../../server/thei/mcp/documents';
import {
  aiOnConfig,
  freshAiTestDb,
  holdSiteConfig,
} from '../helpers/fresh-ai-db';

/**
 * What the AI keeps besides sessions: memory anchored to what it is about
 * and read only with it, the owner's dictionary, and a model's digests of
 * entities kept while they read the same. Remembered by actions the owner
 * applies and takes back, by hand, and gone with what it was about.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const EVENT = 'e-33333333-3333-4333-8333-333333333333';
const DIARY = 'd-1';
const project = { kind: 'project' as const, id: PROJECT };
const diary = { kind: 'diary-entry' as const, id: DIARY, date: '2026-10-13' };

beforeEach(async () => {
  context = await freshAiTestDb();
  holdSiteConfig(
    context.server,
    aiOnConfig({ instructions: 'I write in the first person.' }),
  );
  const { insert } = context;
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

describe('memory, as the owner changes it', () => {
  it('compacts only the facts as they read when it was proposed', async () => {
    addMemory({ anchor: 'entity', entity: project }, { text: 'One fact.' });
    addMemory(
      { anchor: 'entity', entity: project },
      { text: 'Another fact, said at far greater length than it needs.' },
    );
    const sessionUuid = createSession({ origin: 'owner', title: 'Memory' });
    const { results } = await proposeActions({
      sessionUuid,
      actions: [
        {
          kind: 'memory-compact',
          target: `project:${PROJECT}`,
          facts: ['Two facts.'],
        },
      ],
    });
    const actionUuid = (results[0] as { actionUuid: string }).actionUuid;
    const [first] = anchorRows({ anchor: 'entity', entity: project });
    updateMemory(first!.memoryUuid, 'One fact, said otherwise.');
    expect(
      (await applyActions({ actionUuids: [actionUuid], by: 'owner' })).refused,
    ).toMatch(/moved on/);
    expect(findAction(actionUuid)?.state).toBe('stale');
    expect(
      anchorRows({ anchor: 'entity', entity: project }).map((row) => row.text),
    ).toContain('One fact, said otherwise.');
  });

  it('keeps what it knows of a tag kept for its picture', () => {
    const TAG = 't-1';
    const insert = (sql: string, ...values: unknown[]) =>
      context.rawDb.prepare(sql).run(...values);
    insert(
      "INSERT INTO tags (tagUuid, title, normalizedTitle, slug, publicId) VALUES (?, 'Boats', 'boats', 'boats', 'Boats1')",
      TAG,
    );
    insert(
      "INSERT INTO `tag-usages` (tagUuid, containerType, containerId, sortOrder) VALUES (?, 'project', ?, 0)",
      TAG,
      PROJECT,
    );
    insert(
      "INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, type, size, touchedAt) VALUES ('a-boat', 'boat', 'png', 'af-boat', 'hash-boat', 'original', 'image', 1, 1)",
    );
    insert(
      "INSERT INTO `asset-usages` (assetUuid, containerType, containerId, role) VALUES ('a-boat', 'tag', ?, 'icon')",
      TAG,
    );
    const tag = { kind: 'tag' as const, id: TAG };
    addMemory({ anchor: 'entity', entity: tag }, { text: 'Only real boats.' });
    const { db, schema } = context;
    db.transaction((tx) =>
      deleteTagUsagesForContainer(tx, schema, 'project', PROJECT),
    );
    expect(one('SELECT title FROM tags WHERE tagUuid = ?', TAG)?.title).toBe(
      'Boats',
    );
    expect(
      anchorRows({ anchor: 'entity', entity: tag }).map((row) => row.text),
    ).toEqual(['Only real boats.']);
  });

  it('lists a «never» about a file, to be let go of', async () => {
    context.rawDb
      .prepare(
        "INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, settings, type, size, touchedAt) VALUES ('a-1', 'plan', 'pdf', 'af-1', 'hash-1', 'original', '{}', 'other', 1, 1)",
      )
      .run();
    const sessionUuid = createSession({ origin: 'owner', title: 'Files' });
    const { results } = await proposeActions({
      sessionUuid,
      actions: [{ kind: 'describe', file: 'a-1', text: 'A plan of the pier.' }],
    });
    rejectActions([(results[0] as { actionUuid: string }).actionUuid], {
      never: true,
    });
    const index = await memoryIndex();
    expect(index.entities.map((group) => group.entity)).toEqual([
      expect.objectContaining({
        ref: 'asset:a-1',
        type: 'asset',
        title: 'plan',
      }),
    ]);
    expect(index.entities[0]!.items[0]).toMatchObject({ type: 'never' });
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

  it('keeps a word of several words in the form a phrase has it in', () => {
    saveTerm({ display: 'Нижний Новгород', forms: ['Нижнем Новгороде'] });
    expect(keptWordsIn('жил в Нижнем Новгороде')).toEqual([
      'нижнем',
      'новгороде',
    ]);
  });

  it('settles a word only once it reads as proposed, its forms too', async () => {
    saveTerm({ display: 'Lyosha', note: 'My brother' });
    const sessionUuid = createSession({ origin: 'owner', title: 'Words' });
    const { results } = await proposeActions({
      sessionUuid,
      actions: [{ kind: 'term', word: 'Lyosha', forms: ['Lyoshka'] }],
    });
    const actionUuid = (results[0] as { actionUuid: string }).actionUuid;
    expect((await settleActions([findAction(actionUuid)!]))[0]!.state).toBe(
      'pending',
    );
    // Said otherwise by the owner meanwhile, it no longer stands.
    saveTerm({ display: 'Lyosha', note: 'A friend' }, 'Lyosha');
    expect((await settleActions([findAction(actionUuid)!]))[0]!.state).toBe(
      'stale',
    );
  });

  it('is not taken back over forms the owner gave it since', async () => {
    const [action] = await applied({
      kind: 'term',
      word: 'Kuzova',
      note: 'Islands',
      forms: ['Kuzovah'],
    });
    expect(await undoState(findAction(action!)!)).toBe('ready');
    saveTerm(
      { display: 'Kuzova', note: 'Islands', forms: ['Kuzovakh'] },
      'Kuzova',
    );
    expect(await undoState(findAction(action!)!)).toBe('changed');
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
