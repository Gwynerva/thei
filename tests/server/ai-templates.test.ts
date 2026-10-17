import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { H3Event } from 'h3';
import type { AiMessagePart } from '../../shared/ai';
import { DEFAULT_PROJECT_ACTION } from '../../shared/project-action';
import {
  AI_BUILTIN_TEMPLATE_KEYS,
  builtinTemplateId,
  type AiBuiltinTemplateKey,
} from '../../shared/ai-template';
import { proposeActions } from '../../server/thei/ai/actions/propose';
import { findAction } from '../../server/thei/ai/actions/rows';
import {
  applyActions,
  markTakenInEditor,
  settleActions,
} from '../../server/thei/ai/actions/apply';
import { entityPanel } from '../../server/thei/ai/entity-panel';
import {
  readAssetDescription,
  writeAssetDescription,
} from '../../server/thei/assets/descriptions';
import { deleteAssetRow } from '../helpers/delete-asset';
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
import { invalidateMcpDocuments } from '../../server/thei/mcp/documents';
import { directTools } from '../../server/thei/mcp/registry';
import {
  startFakeModel,
  type FakeModel,
  type FakeTurn,
} from '../helpers/fake-model';
import {
  aiOnConfig,
  fakeModelSettings,
  freshAiTestDb,
  holdSiteConfig,
} from '../helpers/fresh-ai-db';

/**
 * The built-in checks and the owner's ready-made requests. A check is given
 * only what it has not looked at yet, as it reads now — a paragraph, a
 * link, an entity — kept as looked at once its turn went through; with
 * nothing new no session starts. Its own accepted fixes leave what they
 * mended looked at, while the owner's own changes come back to it. From an
 * entity's ✦ it looks at that entity alone, and again from the start when
 * asked; two runs never share what they look at.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;
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

const insert = (table: string, row: Record<string, unknown>) =>
  context.insert(table, row);

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
  context = await freshAiTestDb();
  model = await startFakeModel(() => reply());
  holdSiteConfig(
    context.server,
    aiOnConfig({ model: fakeModelSettings(model) }),
  );
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
  it('are four, with no schedule and offered everywhere', () => {
    expect(AI_BUILTIN_TEMPLATE_KEYS).toEqual([
      'proofread',
      'describe',
      'links',
      'graph',
    ]);
    const builtins = listTemplates().filter((template) => template.builtin);
    expect(builtins.map((template) => template.title)).toEqual([
      'Mistakes in the text',
      'File descriptions',
      'Fixing broken links',
      'Finding possible relations',
    ]);
    const keys = Object.keys(findTemplate(id('proofread'))!);
    expect(keys).not.toContain('schedule');
    expect(keys).not.toContain('offerOn');
    // Only their model is the owner's.
    const changed = saveTemplate(id('links'), {
      model: 'fake-large',
      title: 'Mine',
    });
    expect(changed).toMatchObject({
      title: 'Fixing broken links',
      model: 'fake-large',
    });
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
    expect(brief(first!)).toContain('Proofread what the owner wrote here');
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
    expect([...coverageOf(id('proofread')).keys()]).toContain(
      `text:diary-entry:${DIARY}:diary-body`,
    );
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
    const scoped = await run('proofread', { about: [`diary-entry:${DAY}`] });
    expect(findSession(scoped!)!.title).toBe(`Mistakes in the text · ${DAY}`);
    expect(brief(scoped!)).toContain('Kuzova');
    expect(brief(scoped!)).not.toContain('nobody proofread');
    expect([...coverageOf(id('proofread')).keys()]).toEqual([
      `text:diary-entry:${DIARY}:diary-body`,
    ]);
    expect(
      await run('proofread', { about: [`diary-entry:${DAY}`] }),
    ).toBeNull();
    const again = await run('proofread', {
      about: [`diary-entry:${DAY}`],
      force: true,
    });
    expect(brief(again!)).toContain('Kuzova');
    await expect(runTemplate(id('proofread'), { force: true })).rejects.toThrow(
      /entities named/,
    );
    // The page is still due for the whole archive, its title too.
    expect((await due('proofread')).map((item) => item.subject)).toEqual(
      expect.arrayContaining(['text:page:pg-1:page-body', 'fields:page:pg-1']),
    );
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

  it('is let go of once it is gone from its text', async () => {
    await run('links');
    const links = () =>
      [...coverageOf(id('links')).keys()].filter((subject) =>
        subject.startsWith('link:'),
      );
    expect(links()).toHaveLength(1);
    writeText('diary-entry', DIARY, 'diary-body', [
      paragraph('b0', 'Read the results again.'),
    ]);
    expect(await due('links')).toEqual([]);
    expect(links()).toEqual([]);
  });
});

describe('a ready-made request', () => {
  it('is offered everywhere, beside the checks', async () => {
    saveTemplate(null, {
      title: 'Look over',
      instruction: 'Look over this entry.',
    });
    saveTemplate(null, {
      title: 'Project look',
      instruction: 'Look at this project.',
    });
    const panel = await entityPanel({
      kind: 'diary-entry',
      id: DIARY,
      date: DAY,
    } as never);
    expect(
      panel.templates.map((item) => [item.title, item.builtin ?? null]),
    ).toEqual([
      ['Mistakes in the text', 'proofread'],
      ['File descriptions', 'describe'],
      ['Fixing broken links', 'links'],
      ['Finding possible relations', 'graph'],
      ['Look over', null],
      ['Project look', null],
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

describe('the owner’s words', () => {
  /** The model: asks for the batch the words name, then is done. */
  function narrowing(areas: string[]) {
    reply = () => ({ text: 'Looked.' });
    let asked = false;
    reply = () => {
      if (asked) return { text: 'Looked.' };
      asked = true;
      return { toolCalls: [{ name: 'check_batch', input: { areas } }] };
    };
  }

  it('narrow a run to what they name, and only that is checked', async () => {
    narrowing(['titles']);
    const sessionUuid = await run('proofread', {
      request: 'Only the titles, please.',
    });
    expect(brief(sessionUuid!)).toContain('asked, in their own words');
    expect(brief(sessionUuid!)).toContain('Only the titles, please.');
    // The tool's answer is the batch: the project's title, no text.
    const told = model!.requests[1]!.body.messages.find(
      (item: any) => item.role === 'tool',
    ).content as string;
    expect(told).toContain('title: «Harbour»');
    expect(told).not.toContain('Kuzova');
    expect(told).not.toContain('A harbour.');
    // What it was not given waits.
    const left = (await due('proofread')).map((item) => item.shown).join('\n');
    expect(left).toContain('Kuzova');
    expect(left).toContain('summary: «A harbour.»');
    expect(left).not.toContain('title: «Harbour»');
  });

  it('as the check says them start the run with its batch', async () => {
    const sessionUuid = await run('proofread', {
      request: findTemplate(id('proofread'))!.instruction,
    });
    expect(brief(sessionUuid!)).toContain('Kuzova');
    expect(brief(sessionUuid!)).not.toContain('check_batch');
  });

  it('name entities the run is bound to, and only those', async () => {
    narrowing(['texts']);
    const sessionUuid = await run('proofread', {
      about: [`diary-entry:${DAY}`],
      request: 'The text, not the names.',
    });
    const part = sessionMessages(sessionUuid!)
      .flatMap((message) => message.parts as AiMessagePart[])
      .find((item) => item.type === 'template');
    expect(part).toEqual({
      type: 'template',
      templateId: id('proofread'),
      scope: [`diary-entry:${DAY}`],
    });
    expect([...coverageOf(id('proofread')).keys()]).toEqual([
      `text:diary-entry:${DIARY}:diary-body`,
    ]);
  });
});

describe('every short text the owner typed', () => {
  beforeEach(() => {
    insert('statuses', {
      id: 'st-1',
      ownerType: 'project',
      ownerId: PROJECT,
      kind: 'regular',
      text: 'Bilding the pier',
      createdAt: 1,
      date: '2026-10-01',
    });
    insert('external-links', {
      url: 'https://example.com/pier',
      faviconKey: '',
      touchedAt: 1,
    });
    insert('project-external-links', {
      projectUuid: PROJECT,
      url: 'https://example.com/pier',
      sortOrder: 0,
      note: 'The piers plan',
    });
    insert('entity-relations', {
      firstType: 'diary-entry',
      firstId: DIARY,
      secondType: 'project',
      secondId: PROJECT,
      type: 'related',
      note: { type: 'shared', text: 'The day it bagan' },
      firstSortOrder: 0,
      secondSortOrder: 0,
    });
    insert('assets', {
      assetUuid: 'a-1',
      slug: 'plan',
      extension: 'pdf',
      familyUuid: 'af-1',
      contentHash: 'hash-1',
      settingsKey: 'original',
      type: 'other',
      size: 1,
      touchedAt: 1,
    });
    insert('asset-usages', {
      assetUuid: 'a-1',
      containerType: 'project',
      containerId: PROJECT,
      role: 'other-asset',
      meta: {
        role: 'other-asset',
        order: 0,
        title: 'Plan of the pier',
        caption: 'Drawn in wintr',
        isPrivate: false,
      },
    });
    context.rawDb
      .prepare('UPDATE projects SET action = ? WHERE projectUuid = ?')
      .run(
        JSON.stringify({
          ...DEFAULT_PROJECT_ACTION,
          enabled: true,
          text: 'Visti the harbour',
          externalUrl: 'https://example.com',
        }),
        PROJECT,
      );
    writeText('diary-entry', DIARY, 'diary-body', [
      paragraph('b0', PARAGRAPHS[0]!),
      {
        id: 'b1',
        type: 'contentAttachment',
        data: { asset: { assetUuid: 'a-1' }, title: 'Old plan', caption: '' },
      },
    ]);
    invalidateMcpDocuments();
  });

  it('is given to proofread, each with how it is named', async () => {
    const shown = (await due('proofread')).map((item) => item.shown).join('\n');
    for (const line of [
      'title: «Harbour»',
      'summary: «A harbour.»',
      'statuses st-1 (2026-10-01): «Bilding the pier»',
      'links https://example.com/pier: note: «The piers plan»',
      'relations project:p-1: note: «The day it bagan»',
      'files a-1: title: «Plan of the pier»',
      'files a-1: caption: «Drawn in wintr»',
      'actionText (its button): «Visti the harbour»',
      'displayName: «Owner»',
      'title="Old plan"',
    ])
      expect(shown).toContain(line);
  });

  it('stays proofread once a fix of it is applied, and comes back when changed', async () => {
    await run('proofread');
    expect(await due('proofread')).toEqual([]);
    const sessionUuid = createSession({ origin: 'owner', title: 'Fixes' });
    const { results } = await proposeActions({
      sessionUuid,
      actions: [
        {
          kind: 'update',
          target: `project:${PROJECT}`,
          changes: {
            statuses: [{ id: 'st-1', text: 'Building the pier' }],
            actionText: 'Visit the harbour',
          },
        } as never,
      ],
    });
    const actionUuid = (results[0] as { actionUuid: string }).actionUuid;
    const outcome = await applyActions({
      actionUuids: [actionUuid],
      by: 'owner',
    });
    expect(outcome.refused ?? outcome.failed?.error).toBeUndefined();
    expect(outcome.applied).toHaveLength(1);
    expect(
      context.rawDb
        .prepare("SELECT text FROM statuses WHERE id = 'st-1'")
        .get(),
    ).toEqual({ text: 'Building the pier' });
    expect(findAction(actionUuid)!.state).toBe('applied');
    expect(await due('proofread')).toEqual([]);
    // A title changed in a file block hands its paragraph back.
    writeText('diary-entry', DIARY, 'diary-body', [
      paragraph('b0', PARAGRAPHS[0]!),
      {
        id: 'b1',
        type: 'contentAttachment',
        data: { asset: { assetUuid: 'a-1' }, title: 'Old pln', caption: '' },
      },
    ]);
    const [item] = await due('proofread');
    expect(item!.subject).toBe(`text:diary-entry:${DIARY}:diary-body`);
  });
});

describe('what an applied action leaves proofread', () => {
  const shortTextsDue = async () =>
    (await due('proofread'))
      .filter((item) => item.subject.startsWith('fields:'))
      .map((item) => item.shown)
      .join('\n');
  const propose = async (...actions: Record<string, unknown>[]) => {
    const sessionUuid = createSession({ origin: 'owner', title: 'Fixes' });
    const { results } = await proposeActions({
      sessionUuid,
      actions: actions as never,
    });
    return results.map(
      (result) => (result as { actionUuid: string }).actionUuid,
    );
  };

  it('is only what stands: an overtaken fix leaves the owner’s words due', async () => {
    const [fix] = await propose({
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'title',
      value: 'Harbor',
    });
    context.rawDb
      .prepare(
        "UPDATE projects SET title = 'Harbour Towm', updatedAt = 50 WHERE projectUuid = ?",
      )
      .run(PROJECT);
    await settleActions([findAction(fix!)!]);
    expect(findAction(fix!)?.state).toBe('stale');
    expect(await shortTextsDue()).toContain('title: «Harbour Towm»');
  });

  it('is every fix of one entity applied together', async () => {
    const ids = await propose(
      {
        kind: 'field',
        target: `project:${PROJECT}`,
        field: 'title',
        value: 'Harbour Bay',
      },
      {
        kind: 'field',
        target: `project:${PROJECT}`,
        field: 'summary',
        value: 'A small harbour.',
      },
    );
    expect(
      (await applyActions({ actionUuids: ids, by: 'owner' })).applied,
    ).toHaveLength(2);
    const shown = await shortTextsDue();
    expect(shown).not.toContain('title: «Harbour Bay»');
    expect(shown).not.toContain('summary: «A small harbour.»');
  });

  it('is of a relation the note of its pair alone', async () => {
    addDiary('d-2', '2026-10-14', 'The next day.');
    insert('entity-relations', {
      firstType: 'project',
      firstId: PROJECT,
      secondType: 'diary-entry',
      secondId: 'd-2',
      type: 'related',
      note: { type: 'shared', text: 'The day aftr' },
      firstSortOrder: 0,
      secondSortOrder: 0,
    });
    invalidateMcpDocuments();
    const [relation] = await propose({
      kind: 'relation',
      target: `diary-entry:${DAY}`,
      other: `project:${PROJECT}`,
      relation: 'depends-on',
      note: 'The day it began',
      reason: 'The harbour began that day.',
      whyNotInlineLink: 'The day is a stage of the work.',
    });
    expect(
      (await applyActions({ actionUuids: [relation!], by: 'owner' })).applied,
    ).toHaveLength(1);
    const shown = await shortTextsDue();
    expect(shown).not.toContain('«The day it began»');
    expect(shown).toContain('«The day aftr»');
  });
});

describe('the files of the archive', () => {
  /** A file of its own family, placed where named. */
  function addFile(
    n: number,
    place: { containerType: string; containerId: string } | null,
    type = 'image',
  ) {
    insert('assets', {
      assetUuid: `a-${n}`,
      slug: `file-${n}`,
      extension: type === 'image' ? 'png' : 'pdf',
      familyUuid: `af-${n}`,
      contentHash: `hash-${n}`,
      settingsKey: 'original',
      settings: {},
      type,
      size: 1,
      touchedAt: 100 + n,
    });
    if (place)
      insert('asset-usages', {
        assetUuid: `a-${n}`,
        ...place,
        role: 'other-asset',
        meta: {
          role: 'other-asset',
          order: n,
          title: `File ${n}`,
          caption: '',
          isPrivate: false,
        },
      });
  }
  const onProject = { containerType: 'project', containerId: PROJECT };

  beforeEach(() => {
    for (const n of [2, 3, 4, 5]) addFile(n, onProject);
    // One in the diary's text.
    addFile(1, {
      containerType: 'content',
      containerId: `c-${DIARY}-diary-body`,
    });
    // One described already, one only brought into a session.
    addFile(6, onProject);
    writeAssetDescription('a-6', 'The pier at dawn', {
      expectedUpdatedAt: null,
    });
    addFile(7, { containerType: 'ai-session', containerId: 's-1' });
    // A preview of a file is no file of the library.
    insert('assets', {
      assetUuid: 'a-5-preview',
      slug: 'file-5-preview',
      extension: 'webp',
      familyUuid: 'af-5',
      contentHash: 'hash-5-preview',
      settingsKey: 'preview',
      type: 'image',
      size: 1,
      touchedAt: 200,
    });
  });

  const subjects = async (
    key: AiBuiltinTemplateKey,
    options: Parameters<typeof due>[1] = {},
  ) => (await due(key, options)).map((item) => item.subject);

  it('are described where they have no description, three a run, the latest first', async () => {
    const batch = await due('describe');
    expect(batch.map((item) => [item.subject, item.fingerprint])).toEqual([
      ['file:af-5', 'hash-5'],
      ['file:af-4', 'hash-4'],
      ['file:af-3', 'hash-3'],
    ]);
    expect(batch[0]!.shown).toContain('# File a-5');
    expect(batch[0]!.shown).toContain('none yet: propose one with describe');
    // What its places say of it comes with it.
    expect(batch[0]!.shown).toContain(
      `- project:${PROJECT} — Harbour, its files: titled “File 5”`,
    );
  });

  it('are kept as looked at when they could not be shown, until their bytes change', async () => {
    let asked = false;
    reply = () => {
      if (asked) return { text: 'a-5 could not be shown.' };
      asked = true;
      return { toolCalls: [{ name: 'look_at_file', input: { file: 'a-5' } }] };
    };
    const sessionUuid = await run('describe');
    expect(brief(sessionUuid!)).toContain('Describe the files that have none');
    expect(brief(sessionUuid!)).toContain(
      'Read what each file’s places say before you describe it',
    );
    const told = model!.requests[1]!.body.messages.find(
      (item: any) => item.role === 'tool',
    ).content as string;
    expect(told).toContain('This file cannot be shown');
    expect(await subjects('describe')).toEqual(['file:af-2', 'file:af-1']);
    // Another file in its place is looked at anew.
    context.rawDb
      .prepare(
        "UPDATE assets SET contentHash = 'hash-5b' WHERE assetUuid = 'a-5'",
      )
      .run();
    expect(await subjects('describe')).toEqual([
      'file:af-5',
      'file:af-2',
      'file:af-1',
    ]);
  });

  it('are those of the entities and files a run is about', async () => {
    expect(
      await subjects('describe', {
        scope: [{ kind: 'diary-entry', id: DIARY }],
      } as never),
    ).toEqual(['file:af-1']);
    expect(
      await subjects('describe', {
        scope: [{ kind: 'asset', id: 'a-2' }],
      } as never),
    ).toEqual(['file:af-2']);
    // A project's are its sections' too.
    insert('project-content-sections', {
      sectionUuid: 's-1',
      projectUuid: PROJECT,
      title: 'Pier',
      humanReadableSlug: 'pier',
      publicId: 'S1',
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    addFile(8, { containerType: 'project-section', containerId: 's-1' });
    expect(
      await subjects('describe', {
        scope: [{ kind: 'project', id: PROJECT }],
      } as never),
    ).toEqual(['file:af-8', 'file:af-5', 'file:af-4']);
    const sessionUuid = await run('describe', { about: ['asset:a-2'] });
    expect(findSession(sessionUuid!)!.title).toContain('file-2');
    expect(await subjects('describe')).not.toContain('file:af-2');
    // Asked again, the file is looked at again.
    expect(
      await subjects('describe', {
        scope: [{ kind: 'asset', id: 'a-2' }],
        force: true,
      } as never),
    ).toEqual(['file:af-2']);
  });

  it('have their descriptions proofread, one taken from a proposal as it reads', async () => {
    const proofread = async () =>
      (await due('proofread')).filter((item) =>
        item.subject.startsWith('description:'),
      );
    const [item] = await proofread();
    expect(item).toMatchObject({
      subject: 'description:af-6',
      family: 'af-6',
    });
    expect(item!.shown).toContain('File asset:a-6: its description');
    expect(item!.shown).toContain('«The pier at dawn»');
    await run('proofread');
    expect(await proofread()).toEqual([]);
    const sessionUuid = createSession({ origin: 'owner', title: 'Files' });
    const { results } = await proposeActions({
      sessionUuid,
      actions: [
        { kind: 'describe', file: 'a-5', text: 'A boat at the pier' } as never,
      ],
    });
    const outcome = await applyActions({
      actionUuids: [(results[0] as { actionUuid: string }).actionUuid],
      by: 'owner',
    });
    expect(outcome.applied).toHaveLength(1);
    expect(await proofread()).toEqual([]);
    expect(await subjects('describe')).not.toContain('file:af-5');
    // The owner's own words are proofread anew.
    writeAssetDescription('a-5', 'A boat at the peir', {
      expectedUpdatedAt: readAssetDescription('a-5')!.updatedAt,
    });
    expect((await proofread()).map((entry) => entry.subject)).toEqual([
      'description:af-5',
    ]);
  });

  it('are forgotten with the last file of their family', async () => {
    await run('describe');
    expect(coverageOf(id('describe')).has('file:af-5')).toBe(true);
    context.rawDb
      .prepare("DELETE FROM `asset-usages` WHERE assetUuid = 'a-5'")
      .run();
    deleteAssetRow('a-5');
    // A preview left keeps it.
    expect(coverageOf(id('describe')).has('file:af-5')).toBe(true);
    deleteAssetRow('a-5-preview');
    expect(coverageOf(id('describe')).has('file:af-5')).toBe(false);
    expect(coverageOf(id('describe')).has('file:af-4')).toBe(true);
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
