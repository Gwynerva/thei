import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { H3Event } from 'h3';
import type { AiMessagePart } from '../../shared/ai';
import {
  AI_BUILTIN_TEMPLATE_KEYS,
  builtinTemplateId,
  type AiBuiltinTemplateKey,
} from '../../shared/ai-template';
import { proposeActions } from '../../server/thei/ai/actions/propose';
import {
  applyActions,
  markTakenInEditor,
} from '../../server/thei/ai/actions/apply';
import { entityPanel } from '../../server/thei/ai/entity-panel';
import { forgetAiAnchors } from '../../server/thei/ai/memory/forget';
import { turnsSettled } from '../../server/thei/ai/runner/queue';
import { startOwnerSession } from '../../server/thei/ai/sessions/owner';
import {
  createSession,
  findSession,
  sessionMessages,
} from '../../server/thei/ai/sessions/store';
import {
  busySubjects,
  coverageOf,
} from '../../server/thei/ai/templates/coverage';
import { runTemplate } from '../../server/thei/ai/templates/run';
import { TEMPLATE_SOURCES } from '../../server/thei/ai/templates/sources';
import {
  copyTemplate,
  deleteTemplate,
  findTemplate,
  listTemplates,
  saveTemplate,
} from '../../server/thei/ai/templates/store';
import { setTheiConfig, theiConfig } from '../../server/thei/config/index';
import { invalidateMcpDocuments } from '../../server/thei/mcp/documents';
import { directTools } from '../../server/thei/mcp/registry';
import {
  startFakeModel,
  type FakeModel,
  type FakeTurn,
} from '../helpers/fake-model';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * The built-in checks and the owner's ready-made requests. A check is given
 * only what it has not looked at yet, as it reads now — a paragraph, a
 * link, an entity — kept as looked at once its turn went through; with
 * nothing new no session starts. Its own accepted fixes leave what they
 * mended looked at, while the owner's own changes come back to it. From an
 * entity's ✦ it looks at that entity alone, and again from the start when
 * asked; two runs never share what they look at.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;
let model: FakeModel | undefined;
/** What the model answers next; it may take its time. */
let reply: () => FakeTurn | Promise<FakeTurn> = () => ({ text: 'Looked.' });

const DIARY = 'd-1';
const DAY = '2026-10-13';
const PROJECT = 'p-1';
const PARAGRAPHS = [
  'Went to the Kuzova islnds with Lyosha today.',
  'The boat lft at nine; the sea was calm all the way.',
  'On the way back we saw seals on the rocks.',
  'Evening tea at the pier.',
];

const header = (id: string, text: string) => ({
  id,
  type: 'header',
  data: { text, level: 2 },
});
const paragraph = (id: string, text: string) => ({
  id,
  type: 'paragraph',
  data: { text },
});
const link = (type: string, id: string, words: string, fragment?: string) =>
  `<a data-content-link="entity" data-entity-type="${type}" data-entity-id="${id}"${fragment ? ` data-entity-fragment="${fragment}"` : ''}>${words}</a>`;

function insert(table: string, row: Record<string, unknown>) {
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
}

let clock = 10;
/** Writes a text as the owner's form would: the text, and its entity's version. */
function writeText(
  ownerType: string,
  ownerId: string,
  slot: string,
  blocks: unknown[],
) {
  clock++;
  const data = JSON.stringify({ blocks });
  const updated = context.rawDb
    .prepare(
      'UPDATE content SET data = ?, updatedAt = ? WHERE ownerType = ? AND ownerId = ? AND slot = ?',
    )
    .run(data, clock, ownerType, ownerId, slot);
  if (!updated.changes)
    insert('content', {
      contentUuid: `c-${ownerId}-${slot}`,
      ownerType,
      ownerId,
      slot,
      data,
      createdAt: clock,
      updatedAt: clock,
    });
  invalidateMcpDocuments();
}

function writeDiary(paragraphs: string[]) {
  writeText(
    'diary-entry',
    DIARY,
    'diary-body',
    paragraphs.map((text, index) => paragraph(`b${index}`, text)),
  );
}

function addDiary(id: string, day: string, text: string) {
  insert('diary-entries', {
    diaryUuid: id,
    date: day,
    access: 'public',
    createdAt: 1,
    updatedAt: 1,
  });
  writeText('diary-entry', id, 'diary-body', [paragraph(`${id}-b`, text)]);
}

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    version: '0.0.6',
    console: {
      log() {},
      warn() {},
      error() {},
      tag: () => ({ log() {}, warn() {}, error() {} }),
    },
    ...serverRepositories,
  });
  model = await startFakeModel(() => reply());
  setTheiConfig({
    version: '0.0.6',
    siteUrl: 'https://example.test',
    languageCode: 'en',
    mcp: {
      enabled: true,
      instructions: '',
      model: {
        provider: 'openai',
        apiKey: '',
        baseUrl: model.url,
        model: 'fake-small',
      },
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
  insert('profiles', { profileId: 'profile', displayName: 'Owner' });
  insert('projects', {
    projectUuid: PROJECT,
    title: 'Harbour',
    summary: 'A harbour.',
    access: 'public',
    humanReadableSlug: 'harbour',
    publicId: 'P1',
    createdAt: 1,
    updatedAt: 1,
  });
  insert('diary-entries', {
    diaryUuid: DIARY,
    date: DAY,
    access: 'public',
    createdAt: 1,
    updatedAt: 1,
  });
  writeDiary(PARAGRAPHS);
  reply = () => ({ text: 'Looked.' });
});

afterEach(async () => {
  await turnsSettled();
  await model?.close();
  model = undefined;
  await context.close();
});

const id = (key: AiBuiltinTemplateKey) => builtinTemplateId(key);

/** Runs a check and waits for its turn. */
async function run(
  key: AiBuiltinTemplateKey,
  options: Parameters<typeof runTemplate>[1] = {},
) {
  const { sessionUuid } = await runTemplate(id(key), options);
  await turnsSettled();
  return sessionUuid;
}

/** What a check would be given now. */
function due(
  key: AiBuiltinTemplateKey,
  options: { scope?: Parameters<typeof runTemplate>[1]; force?: boolean } = {},
) {
  return TEMPLATE_SOURCES[key].due({
    covered: coverageOf(id(key)),
    busy: busySubjects(id(key)),
    ...options,
  } as never);
}

/** What the model was asked in a run's session. */
function brief(sessionUuid: string) {
  return sessionMessages(sessionUuid)
    .flatMap((message) => message.transcript)
    .map((turn) => ('text' in turn ? turn.text : ''))
    .join('\n');
}

async function toolText(name: string, args: unknown) {
  const tool = directTools({
    event: {} as H3Event,
    principal: { tokenUuid: 'tk-test', label: 'Test', scopes: ['read'] },
  }).find((item) => item.name === name)!;
  const result = await tool.call(args);
  return result.content
    .map((part) => ('text' in part ? part.text : ''))
    .join('\n');
}

describe('the built-in checks', () => {
  it('are three, offered where they can look, with no schedule', () => {
    expect(AI_BUILTIN_TEMPLATE_KEYS).toEqual(['proofread', 'links', 'graph']);
    const builtins = listTemplates().filter((template) => template.builtin);
    expect(builtins.map((template) => template.title)).toEqual([
      'Fixing text mistakes',
      'Fixing broken links',
      'Finding possible relations',
    ]);
    expect(findTemplate(id('graph'))!.offerOn).toEqual([
      'project',
      'event',
      'diary-entry',
    ]);
    expect(Object.keys(findTemplate(id('proofread'))!)).not.toContain(
      'schedule',
    );
    // Only their model and where they are offered are the owner's.
    const changed = saveTemplate(id('links'), {
      model: 'fake-large',
      offerOn: ['page'],
      title: 'Mine',
    });
    expect(changed).toMatchObject({
      title: 'Fixing broken links',
      model: 'fake-large',
      offerOn: ['page'],
    });
    // A check is offered only where it can look.
    expect(
      saveTemplate(id('graph'), { offerOn: ['page', 'event'] }).offerOn,
    ).toEqual(['event']);
    expect(() => deleteTemplate(id('links'))).toThrow();
    const copy = copyTemplate(id('links'));
    expect(copy.title).toBe('Fixing broken links (copy)');
    expect(copy.builtin).toBeUndefined();
  });
});

describe('a run', () => {
  it('starts no session when nothing new is there to look at', async () => {
    const first = await run('proofread');
    expect(first).not.toBeNull();
    expect(brief(first!)).toContain('Proofread these parts');
    expect(brief(first!)).toContain('Went to the Kuzova islnds');
    expect(findSession(first!)).toMatchObject({
      origin: 'template',
      templateId: id('proofread'),
      state: 'idle',
    });
    const part = sessionMessages(first!)
      .flatMap((message) => message.parts as AiMessagePart[])
      .find((item) => item.type === 'template');
    expect(part).toEqual({ type: 'template', templateId: id('proofread') });
    expect(model!.requests).toHaveLength(1);

    expect(await run('proofread')).toBeNull();
    expect(model!.requests).toHaveLength(1);
  });

  it('is given, of a text changed since, only the paragraph changed', async () => {
    await run('proofread');
    writeDiary([
      PARAGRAPHS[0]!,
      PARAGRAPHS[1]!,
      'On the way back we saw seals on the rocks, and a whale.',
      PARAGRAPHS[3]!,
    ]);
    const [item, ...rest] = await due('proofread');
    expect(rest).toEqual([]);
    expect(item!.subject).toBe(`text:diary-entry:${DIARY}:diary-body`);
    expect(item!.shown).toContain('and a whale');
    // The paragraph before and after it stand by it; the rest is left out.
    expect(item!.shown).toContain('The boat lft');
    expect(item!.shown).not.toContain('Kuzova');
    expect(item!.shown).toContain('…');
    // A link a paragraph gains leaves it as proofread.
    await run('proofread');
    writeText('diary-entry', DIARY, 'diary-body', [
      paragraph('b0', PARAGRAPHS[0]!),
      paragraph('b1', PARAGRAPHS[1]!),
      paragraph(
        'b2',
        `On the way back we saw ${link('project', PROJECT, 'seals')} on the rocks, and a whale.`,
      ),
      paragraph('b3', PARAGRAPHS[3]!),
    ]);
    expect(await due('proofread')).toEqual([]);
  });

  it('covers nothing when its turn failed', async () => {
    reply = () => ({ error: { status: 500 } });
    const failed = await run('proofread');
    expect(findSession(failed!)!.error).toBe('busy');
    expect(coverageOf(id('proofread')).size).toBe(0);
    expect(busySubjects(id('proofread')).size).toBe(0);
    reply = () => ({ text: 'Looked.' });
    expect(await run('proofread')).not.toBeNull();
    expect(coverageOf(id('proofread')).size).toBe(1);
  });

  it('is given a run’s worth, and the rest the next time', async () => {
    for (let day = 1; day <= 9; day++)
      addDiary(`d-x${day}`, `2026-09-0${day}`, `Day ${day} by the sea.`);
    const first = await run('graph');
    expect(brief(first!).match(/^- diary-entry:/gm)).toHaveLength(8);
    const second = await run('graph');
    // Ten entries and a project: three were left.
    expect(brief(second!).match(/^- (diary-entry|project):/gm)).toHaveLength(3);
    expect(await run('graph')).toBeNull();
  });

  it('never gives two runs the same', async () => {
    for (let day = 1; day <= 9; day++)
      addDiary(`d-x${day}`, `2026-09-0${day}`, `Day ${day} by the sea.`);
    let open!: () => void;
    const held = new Promise<void>((resolve) => (open = resolve));
    reply = async () => {
      await held;
      return { text: 'Looked.' };
    };
    const first = await runTemplate(id('graph'));
    const second = await runTemplate(id('graph'));
    const { db, schema } = context;
    const bySession = db.select().from(schema.aiTemplateBatches).all();
    const ofFirst = bySession
      .filter((row) => row.sessionUuid === first.sessionUuid)
      .map((row) => row.subject);
    const ofSecond = bySession
      .filter((row) => row.sessionUuid === second.sessionUuid)
      .map((row) => row.subject);
    expect(ofFirst).toHaveLength(8);
    expect(ofSecond).toHaveLength(3);
    expect(ofFirst.filter((subject) => ofSecond.includes(subject))).toEqual([]);
    // A third finds everything taken.
    expect((await runTemplate(id('graph'))).sessionUuid).toBeNull();
    open();
    await turnsSettled();
    expect(coverageOf(id('graph')).size).toBe(11);
  });

  it('looks at one entity from its ✦, and at it again when asked', async () => {
    insert('pages', {
      pageUuid: 'pg-1',
      title: 'Notes',
      slug: 'notes',
      summary: 'Notes.',
      access: 'public',
      createdAt: 1,
      updatedAt: 1,
    });
    writeText('page', 'pg-1', 'page-body', [
      paragraph('n1', 'A page nobody proofread.'),
    ]);
    const scoped = await run('proofread', { about: `diary-entry:${DAY}` });
    expect(findSession(scoped!)!.title).toBe(`Fixing text mistakes · ${DAY}`);
    expect(brief(scoped!)).toContain('Kuzova');
    expect(brief(scoped!)).not.toContain('nobody proofread');
    expect([...coverageOf(id('proofread')).keys()]).toEqual([
      `text:diary-entry:${DIARY}:diary-body`,
    ]);
    expect(await run('proofread', { about: `diary-entry:${DAY}` })).toBeNull();
    const again = await run('proofread', {
      about: `diary-entry:${DAY}`,
      force: true,
    });
    expect(brief(again!)).toContain('Kuzova');
    await expect(runTemplate(id('proofread'), { force: true })).rejects.toThrow(
      /one entity/,
    );
    // The page is still due for the whole archive.
    expect((await due('proofread')).map((item) => item.subject)).toEqual([
      'text:page:pg-1:page-body',
    ]);
  });

  it('is forgotten with the entity it looked at', async () => {
    await run('graph');
    expect(coverageOf(id('graph')).has(`entity:diary-entry:${DIARY}`)).toBe(
      true,
    );
    const { db, schema } = context;
    db.transaction((tx) => forgetAiAnchors(tx, schema, 'diary-entry', [DIARY]));
    expect(coverageOf(id('graph')).has(`entity:diary-entry:${DIARY}`)).toBe(
      false,
    );
  });
});

describe('what an accepted fix leaves', () => {
  const fix = (find: string, replace: string) => ({
    kind: 'revise',
    target: `diary-entry:${DAY}`,
    text: 'body',
    mode: 'proofread',
    corrections: [{ find, replace, category: 'spelling', reason: 'A typo' }],
  });

  it('proofread, while the owner’s own change waits for the next run', async () => {
    await run('proofread');
    const sessionUuid = createSession({ origin: 'owner', title: 'Fixes' });
    const proposed = async (action: Record<string, unknown>) => {
      const { results } = await proposeActions({
        sessionUuid,
        actions: [action as never],
      });
      return (results[0] as { actionUuid: string }).actionUuid;
    };

    // Applied from its session: the paragraph it mended stays proofread.
    await applyActions({
      actionUuids: [await proposed(fix('islnds', 'islands'))],
      by: 'owner',
    });
    expect(await due('proofread')).toEqual([]);

    // Taken in the editor, saved with a change of the owner's beside it.
    const actionUuid = await proposed(fix('lft', 'left'));
    writeDiary([
      'Went to the Kuzova islands with Lyosha today.',
      'The boat left at nine; the sea was calm all the way.',
      PARAGRAPHS[2]!,
      'Evening tea at the pier, and cards.',
    ]);
    markTakenInEditor(actionUuid, { c1: 'accepted' });
    const [item, ...rest] = await due('proofread');
    expect(rest).toEqual([]);
    expect(item!.shown).toContain('and cards');
    expect(item!.shown).not.toContain('The boat left');
  });

  it('leaves an entity related since as looked at for relations', async () => {
    await run('graph');
    expect(await due('graph')).toEqual([]);
    const sessionUuid = createSession({ origin: 'owner', title: 'Relations' });
    const { results } = await proposeActions({
      sessionUuid,
      actions: [
        {
          kind: 'relation',
          target: `diary-entry:${DAY}`,
          other: `project:${PROJECT}`,
          relation: 'related',
          whyNotInlineLink: 'The day the harbour began.',
          reason: 'The entry tells of the harbour.',
        },
      ],
    });
    const outcome = await applyActions({
      actionUuids: [(results[0] as { actionUuid: string }).actionUuid],
      by: 'owner',
    });
    expect(outcome.applied).toHaveLength(1);
    invalidateMcpDocuments();
    expect(await due('graph')).toEqual([]);
  });
});

describe('a link the model left', () => {
  beforeEach(() => {
    writeText('project', PROJECT, 'project-description', [
      header('h1', 'Goals'),
    ]);
    writeText('diary-entry', DIARY, 'diary-body', [
      paragraph(
        'b0',
        `Read ${link('project', PROJECT, 'the results', 'results')} again.`,
      ),
    ]);
  });

  it('comes back once a heading it could lead to appears', async () => {
    const first = await run('links');
    expect(brief(first!)).toContain('the heading it led to is gone');
    expect(await run('links')).toBeNull();
    writeText('project', PROJECT, 'project-description', [
      header('h1', 'Goals'),
      header('h2', 'Result'),
    ]);
    const [item] = await due('links');
    expect(item!.subject).toMatch(
      new RegExp(`^link:diary-entry:${DAY}:diary-body:`),
    );
    expect(item!.shown).toContain('#result');
  });
});

describe('a ready-made request', () => {
  it('is offered on the kinds it names, beside the checks', async () => {
    const own = saveTemplate(null, {
      title: 'Look over',
      instruction: 'Look over this entry.',
      offerOn: ['diary-entry', 'nonsense'],
    });
    saveTemplate(null, {
      title: 'Project only',
      instruction: 'Look at this project.',
      offerOn: ['project'],
    });
    expect(own.offerOn).toEqual(['diary-entry']);
    const panel = await entityPanel({
      kind: 'diary-entry',
      id: DIARY,
      date: DAY,
    } as never);
    expect(
      panel.templates.map((item) => [item.title, item.builtin ?? null]),
    ).toEqual([
      ['Fixing text mistakes', 'proofread'],
      ['Fixing broken links', 'links'],
      ['Finding possible relations', 'graph'],
      ['Look over', null],
    ]);
  });

  it('opens the owner’s session, and is never run as a check is', async () => {
    const own = saveTemplate(null, {
      title: 'Look over',
      instruction: 'Look over this entry.',
    });
    const sessionUuid = startOwnerSession({
      text: 'Look over this entry, and mind the names.',
      about: [`diary-entry:${DAY}`],
      templateId: own.templateId,
    });
    await turnsSettled();
    expect(findSession(sessionUuid)).toMatchObject({
      origin: 'owner',
      templateId: own.templateId,
      title: 'Look over',
    });
    await expect(runTemplate(own.templateId)).rejects.toThrow(
      /ready-made request/,
    );
    expect(() =>
      startOwnerSession({ text: 'Go.', templateId: id('proofread') }),
    ).toThrow();
  });
});

describe('what changed', () => {
  it('lists what was made or changed from the moment named', async () => {
    expect(await toolText('changes_since', {})).toContain(
      'The arguments do not fit',
    );
    const listed = await toolText('changes_since', { from: '1970-01-01' });
    expect(listed).toContain(`diary-entry:${DAY}`);
    const none = await toolText('changes_since', {
      from: '1970-01-01',
      kinds: ['page'],
    });
    expect(none).toContain('_(nothing)_');
  });
});
