import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_MODEL } from '../../shared/ai-model';
import { readEventEdit, saveEventEdit } from '../../server/thei/events/edit';
import type { EventEditData } from '../../shared/event';
import {
  createSession,
  findSession,
} from '../../server/thei/ai/sessions/store';
import {
  proposeActions,
  type ActionProposal,
} from '../../server/thei/ai/actions/propose';
import {
  applyActions,
  decideParts,
  markTakenInEditor,
  settleActions,
} from '../../server/thei/ai/actions/apply';
import {
  neverAgain,
  neverPart,
  rejectActions,
  restoreActions,
} from '../../server/thei/ai/actions/decide';
import { actionLocks } from '../../server/thei/ai/actions/lock';
import { loadForm } from '../../server/thei/ai/forms/load';
import { subscribeSession } from '../../server/thei/ai/sessions/bus';
import { saveProjectEdit } from '../../server/thei/projects/edit';
import { undoAction, undoState } from '../../server/thei/ai/actions/undo';
import { findAction } from '../../server/thei/ai/actions/rows';
import { assetIdsIn } from '../../server/thei/ai/actions/values';
import { assetsHeldByAi } from '../../server/thei/assets/holds';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * Actions a session proposes and the owner applies: checked when proposed,
 * applied through the entity's own save, taken back while nothing changed
 * since, and never offered again once the owner said so.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const TAG = 't-22222222-2222-4222-8222-222222222222';
const DIARY = 'd-1';

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    version: '0.0.6',
    config: {
      siteUrl: 'https://example.test',
      languageCode: 'en',
      mcp: {
        enabled: true,
        instructions: '',
        model: { ...DEFAULT_AI_MODEL },
        monthlyTokens: 10_000_000,
      },
    },
    console: { log() {}, warn() {}, error() {} },
    ...serverRepositories,
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
  const text = (blocks: unknown[]) => ({ blocks });
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
  insert('tags', {
    tagUuid: TAG,
    title: 'Games',
    normalizedTitle: 'games',
    slug: 'games',
    publicId: 'Games1',
  });
  insert('tag-usages', {
    tagUuid: TAG,
    containerType: 'project',
    containerId: PROJECT,
    sortOrder: 0,
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
    data: text([
      {
        id: 'b1',
        type: 'paragraph',
        data: { text: 'Finished the bos of the first level today.' },
      },
      {
        id: 'b2',
        type: 'paragraph',
        data: { text: 'Tomorow I will draw the second one.' },
      },
    ]),
    createdAt: 1,
    updatedAt: 5,
  });
});

afterEach(async () => {
  await context.close();
});

const one = (sql: string, ...params: unknown[]) =>
  context.rawDb.prepare(sql).get(...params) as Record<string, any> | undefined;
// Two writes within a millisecond would share a version.
const tick = () => new Promise((resolve) => setTimeout(resolve, 3));

function session() {
  return createSession({ origin: 'owner', title: 'Test' });
}

async function propose(sessionUuid: string, ...actions: ActionProposal[]) {
  return proposeActions({ sessionUuid, actions });
}

async function proposed(sessionUuid: string, action: ActionProposal) {
  const { results } = await propose(sessionUuid, action);
  const result = results[0]!;
  if ('refused' in result) throw new Error(result.refused);
  return result.actionUuid;
}

const summary = () =>
  one('SELECT summary FROM projects WHERE projectUuid = ?', PROJECT)!.summary;

const words = () =>
  JSON.parse(
    one("SELECT data FROM content WHERE contentUuid = 'c-2'")!.data,
  ).blocks.map((block: { data: { text: string } }) => block.data.text);

describe('proposing actions', () => {
  it('keeps what an action was made against, and counts it as waiting', async () => {
    const sessionUuid = session();
    const actionUuid = await proposed(sessionUuid, {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'A remake of a browser game',
      reason: 'The old summary is vague',
    });
    expect(findAction(actionUuid)).toMatchObject({
      state: 'pending',
      certainty: 'sure',
      targetType: 'project',
      targetId: PROJECT,
      base: { value: 'A browser remake' },
    });
    expect(findSession(sessionUuid)).toMatchObject({ waiting: 1 });
    expect(
      one(
        'SELECT role FROM `ai-session-entities` WHERE sessionUuid = ? AND entityId = ?',
        sessionUuid,
        PROJECT,
      )?.role,
    ).toBe('touched');
  });

  it('refuses what is not so, in words a model can act on', async () => {
    const sessionUuid = session();
    const { results } = await propose(
      sessionUuid,
      { kind: 'colour', target: `project:${PROJECT}` },
      { kind: 'field', target: `project:${PROJECT}`, field: 'summary' },
      {
        kind: 'field',
        target: `project:${PROJECT}`,
        field: 'summary',
        value: 'A browser remake',
      },
      { kind: 'periods', target: `project:${PROJECT}`, periods: [] },
      {
        kind: 'field',
        target: `project:${PROJECT}`,
        field: 'title',
        value: 'Parapet!',
        certainty: 'unsure',
      },
    );
    expect(
      results.map((result) => 'refused' in result && result.refused),
    ).toEqual([
      expect.stringMatching(/no action "colour"/),
      expect.stringMatching(/value/),
      expect.stringMatching(/already its value/),
      expect.stringMatching(/about event, project-section, not project/),
      expect.stringMatching(/give its reason/),
    ]);
  });

  it('never makes a deletion the sure call', async () => {
    const actionUuid = await proposed(session(), {
      kind: 'delete',
      target: 'diary-entry:2026-10-13',
      certainty: 'sure',
      reason: 'An empty day',
    });
    expect(findAction(actionUuid)?.certainty).toBe('unsure');
  });

  it('does not offer twice what waits, and lets a new version replace it', async () => {
    const sessionUuid = session();
    const action = {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'A remake',
    };
    const first = await proposed(sessionUuid, action);
    const again = await propose(sessionUuid, action);
    expect(again.results[0]).toMatchObject({
      refused: expect.stringMatching(/waits for the owner already/),
    });
    const second = await proposed(sessionUuid, {
      ...action,
      value: 'A remake of a browser game',
      supersedes: first,
    });
    expect(findAction(first)?.state).toBe('superseded');
    expect(findAction(second)?.supersedes).toBe(first);
    expect(findSession(sessionUuid)).toMatchObject({ waiting: 1 });
  });

  it('proposes an atomic bundle whole or not at all', async () => {
    const sessionUuid = session();
    const { results, bundleUuid } = await proposeActions({
      sessionUuid,
      atomic: true,
      actions: [
        {
          kind: 'field',
          target: `project:${PROJECT}`,
          field: 'summary',
          value: 'A remake',
        },
        {
          kind: 'field',
          target: `project:${PROJECT}`,
          field: 'colour',
          value: 'red',
        },
      ],
    });
    expect(bundleUuid).toBeUndefined();
    expect(results[0]).toMatchObject({
      refused: expect.stringMatching(/atomic bundle/),
    });
    expect(one('SELECT COUNT(*) AS n FROM `ai-actions`')?.n).toBe(0);
  });

  it('proposes alternatives for one field alone, never as a bundle', async () => {
    const sessionUuid = session();
    const { results, bundleUuid } = await propose(
      sessionUuid,
      {
        kind: 'field',
        target: `project:${PROJECT}`,
        field: 'summary',
        value: 'A remake',
      },
      {
        kind: 'field',
        target: `project:${PROJECT}`,
        field: 'summary',
        value: 'A remake, made again',
      },
    );
    expect(bundleUuid).toBeUndefined();
    expect(results[0]).toHaveProperty('actionUuid');
    expect(results[1]).toMatchObject({
      refused: expect.stringMatching(/summary of project:.*calls of their own/),
    });
    expect(one('SELECT COUNT(*) AS n FROM `ai-actions`')?.n).toBe(1);
  });
});

describe('applying and undoing', () => {
  it('applies through the form, and undoes once while nothing changed', async () => {
    const sessionUuid = session();
    const actionUuid = await proposed(sessionUuid, {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'A remake',
    });
    const outcome = await applyActions({
      actionUuids: [actionUuid],
      by: 'owner',
    });
    expect(outcome).toMatchObject({
      applied: [{ actionUuid, entity: `project:${PROJECT}` }],
    });
    expect(summary()).toBe('A remake');
    expect(findAction(actionUuid)).toMatchObject({
      state: 'applied',
      appliedBy: 'owner',
      undo: { kind: 'form', before: { summary: 'A browser remake' } },
    });
    expect(findSession(sessionUuid)).toMatchObject({ waiting: 0, applied: 1 });
    // Applied twice it is not.
    expect(
      (await applyActions({ actionUuids: [actionUuid], by: 'owner' })).refused,
    ).toMatch(/Decided already/);

    await undoAction(actionUuid);
    expect(summary()).toBe('A browser remake');
    expect(findAction(actionUuid)?.state).toBe('undone');
    await expect(undoAction(actionUuid)).rejects.toThrow(/undone already/);
  });

  it('refuses an undo once the fields moved on', async () => {
    const actionUuid = await proposed(session(), {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'A remake',
    });
    await applyActions({ actionUuids: [actionUuid], by: 'owner' });
    await tick();
    const later = await proposed(session(), {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'Later still',
    });
    await applyActions({ actionUuids: [later], by: 'owner' });
    expect(await undoState(findAction(actionUuid)!)).toBe('changed');
    await expect(undoAction(actionUuid)).rejects.toThrow(/changed again since/);
  });

  it('undoes each change of a bundle on its own, whatever came after on the form', async () => {
    const { results } = await proposeActions({
      sessionUuid: session(),
      actions: [
        {
          kind: 'field',
          target: `project:${PROJECT}`,
          field: 'reminder',
          value: 'Check what is said',
        },
        // The relation moves the project's version on after the field.
        {
          kind: 'relation',
          target: `project:${PROJECT}`,
          other: 'diary-entry:2026-10-13',
          relation: 'related',
          reason: 'Named together',
          whyNotInlineLink: 'The day is a part of the work',
        },
      ],
    });
    const [field, relation] = results.map(
      (result) => (result as { actionUuid: string }).actionUuid,
    );
    await applyActions({ actionUuids: [field!, relation!], by: 'owner' });
    // The field change remembers how it left the form, before the relation.
    expect(findAction(field!)?.undo).toMatchObject({
      after: { reminder: 'Check what is said' },
    });
    // Its fields read as it left them: it is undone alone, the relation
    // after it staying where it is.
    expect(await undoState(findAction(field!)!)).toBe('ready');
    await undoAction(field!);
    expect(findAction(field!)?.state).toBe('undone');
    expect(
      one('SELECT reminder FROM projects WHERE projectUuid = ?', PROJECT)!
        .reminder,
    ).toBe('');
    expect(findAction(relation!)?.state).toBe('applied');
    expect(await undoState(findAction(relation!)!)).toBe('ready');
    await undoAction(relation!);
    expect(one('SELECT count(*) AS n FROM `entity-relations`')!.n).toBe(0);
  });

  it('takes back what a bundle applied when one of it fails', async () => {
    const sessionUuid = session();
    const { results, bundleUuid } = await proposeActions({
      sessionUuid,
      actions: [
        {
          kind: 'field',
          target: `project:${PROJECT}`,
          field: 'summary',
          value: 'A remake',
        },
        // Made against the project as it is: the change before it moves it.
        {
          kind: 'delete',
          target: `project:${PROJECT}`,
          reason: 'Done with it',
        },
      ],
    });
    expect(bundleUuid).toBeTruthy();
    const ids = results.map(
      (result) => (result as { actionUuid: string }).actionUuid,
    );
    const outcome = await applyActions({ actionUuids: ids, by: 'owner' });
    expect(outcome.failed).toMatchObject({
      actionUuid: ids[1],
      error: expect.stringMatching(/changed since/),
    });
    expect(outcome.applied).toEqual([]);
    expect(summary()).toBe('A browser remake');
    expect(findAction(ids[0]!)).toMatchObject({ state: 'pending', undo: null });
    expect(findAction(ids[1]!)).toMatchObject({
      state: 'pending',
      error: expect.stringMatching(/changed since/),
    });
    expect(findSession(sessionUuid)).toMatchObject({ waiting: 2, applied: 0 });
  });

  it('applies an atomic bundle only whole', async () => {
    const { results } = await proposeActions({
      sessionUuid: session(),
      atomic: true,
      actions: [
        {
          kind: 'field',
          target: `project:${PROJECT}`,
          field: 'summary',
          value: 'A remake',
        },
        {
          kind: 'tags',
          target: `project:${PROJECT}`,
          add: [{ title: 'Remakes' }],
        },
      ],
    });
    const ids = results.map(
      (result) => (result as { actionUuid: string }).actionUuid,
    );
    expect(
      (await applyActions({ actionUuids: [ids[0]!], by: 'owner' })).refused,
    ).toMatch(/whole bundle/);
    const outcome = await applyActions({ actionUuids: ids, by: 'owner' });
    expect(outcome.applied).toHaveLength(2);
    expect(
      context.rawDb
        .prepare(
          'SELECT t.title FROM `tag-usages` u JOIN tags t ON t.tagUuid = u.tagUuid WHERE u.containerId = ? ORDER BY u.sortOrder',
        )
        .all(PROJECT)
        .map((row: any) => row.title),
    ).toEqual(['Games', 'Remakes']);
  });

  it('takes a tag by its ref alone', async () => {
    const { results } = await proposeActions({
      sessionUuid: session(),
      actions: [
        {
          kind: 'tags',
          target: `project:${PROJECT}`,
          add: [{ ref: `tag:${TAG}` }],
        },
      ],
    });
    // Read as the tag it names — which the project carries already.
    expect(JSON.stringify(results)).toMatch(/already carries/);
  });

  it('marks as done what the owner did by hand, and as stale what moved another way', async () => {
    const sessionUuid = session();
    const done = await proposed(sessionUuid, {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'A remake',
    });
    const stale = await proposed(sessionUuid, {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'title',
      value: 'Parapet Remake',
    });
    context.rawDb
      .prepare(
        "UPDATE projects SET summary = 'A remake', title = 'Parapet II' WHERE projectUuid = ?",
      )
      .run(PROJECT);
    const settled = await settleActions([
      findAction(done)!,
      findAction(stale)!,
    ]);
    expect(settled.map((row) => [row.state])).toEqual([['applied'], ['stale']]);
    expect(findAction(done)?.appliedBy).toBe('owner');
    expect(findSession(sessionUuid)).toMatchObject({ waiting: 0, applied: 1 });
    expect(
      (await applyActions({ actionUuids: [stale], by: 'owner' })).refused,
    ).toMatch(/Decided already/);
  });
});

describe('declining', () => {
  it('does not offer again what the owner declined lately', async () => {
    const sessionUuid = session();
    const action = {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'A remake',
    };
    const actionUuid = await proposed(sessionUuid, action);
    rejectActions([actionUuid]);
    expect(findSession(sessionUuid)).toMatchObject({ waiting: 0, rejected: 1 });
    expect((await propose(session(), action)).results[0]).toMatchObject({
      refused: expect.stringMatching(/declined this lately/),
    });
    // Brought back, it waits again.
    const [restored] = await restoreActions([actionUuid]);
    expect(restored?.state).toBe('pending');
  });

  it('remembers «never» with what it was about, a relation with both its ends', async () => {
    const actionUuid = await proposed(session(), {
      kind: 'relation',
      target: `project:${PROJECT}`,
      other: 'diary-entry:2026-10-13',
      relation: 'depends-on',
      reason: 'The level was finished that day',
      whyNotInlineLink: 'The day is a stage of the work',
    });
    rejectActions([actionUuid], { never: true });
    expect(
      one(
        'SELECT anchor, anchorType, anchorId, otherType, otherId, type FROM `ai-memory`',
      ),
    ).toEqual({
      anchor: 'pair',
      anchorType: 'project',
      anchorId: PROJECT,
      otherType: 'diary-entry',
      otherId: DIARY,
      type: 'never',
    });
    // The same relation, read from its other end.
    const { results } = await propose(session(), {
      kind: 'relation',
      target: 'diary-entry:2026-10-13',
      other: `project:${PROJECT}`,
      relation: 'affects',
      reason: 'The level was finished that day',
      whyNotInlineLink: 'The day is a stage of the work',
    });
    expect(results[0]).toMatchObject({
      refused: expect.stringMatching(/never to offer this again/),
    });
  });
});

describe('a text edit', () => {
  const corrections = [
    {
      find: 'bos',
      replace: 'boss',
      category: 'spelling',
      reason: 'A missing letter',
    },
    {
      find: 'Tomorow',
      replace: 'Tomorrow',
      category: 'spelling',
      certainty: 'unsure',
      reason: 'Maybe on purpose',
    },
  ];

  it('applies the sure parts, keeps the rest waiting, and undoes to the start', async () => {
    const sessionUuid = session();
    const actionUuid = await proposed(sessionUuid, {
      kind: 'revise',
      target: 'diary-entry:2026-10-13',
      text: 'body',
      mode: 'proofread',
      corrections,
    });
    const original = words();
    await applyActions({ actionUuids: [actionUuid], by: 'owner' });
    expect(words()).toEqual([
      'Finished the boss of the first level today.',
      'Tomorow I will draw the second one.',
    ]);
    expect(findAction(actionUuid)).toMatchObject({
      state: 'pending',
      parts: [
        { id: 'c1', state: 'applied' },
        { id: 'c2', state: 'pending' },
      ],
    });
    expect(findSession(sessionUuid)).toMatchObject({ waiting: 1 });
    // The version it replaced is held for the undo.
    expect(
      one(
        "SELECT reason FROM `content-history` WHERE heldBy = ? AND kind = 'revision'",
        actionUuid,
      )?.reason,
    ).toBe('before-ai');

    await tick();
    await applyActions({
      actionUuids: [actionUuid],
      by: 'owner',
      parts: { [actionUuid]: { c2: 'accepted' } },
    });
    expect(words()).toEqual([
      'Finished the boss of the first level today.',
      'Tomorrow I will draw the second one.',
    ]);
    expect(findAction(actionUuid)?.state).toBe('applied');

    await undoAction(actionUuid);
    expect(words()).toEqual(original);
    expect(
      one(
        'SELECT COUNT(*) AS n FROM `content-history` WHERE heldBy = ?',
        actionUuid,
      )?.n,
    ).toBe(0);
  });

  it('leaves a word kept as written alone, then and for good', async () => {
    const actionUuid = await proposed(session(), {
      kind: 'revise',
      target: 'diary-entry:2026-10-13',
      text: 'body',
      mode: 'proofread',
      corrections,
    });
    // The owner keeps one, and declines the rest.
    await applyActions({
      actionUuids: [actionUuid],
      by: 'owner',
      parts: { [actionUuid]: { c1: 'kept', c2: 'accepted' } },
    });
    expect(words()[0]).toBe('Finished the bos of the first level today.');
    const again = await propose(session(), {
      kind: 'revise',
      target: 'diary-entry:2026-10-13',
      text: 'body',
      mode: 'proofread',
      corrections: [corrections[0]!],
    });
    expect(again.results[0]).toMatchObject({
      refused: expect.stringMatching(/kept it as written/),
    });

    neverPart(actionUuid, 'c1');
    expect(one('SELECT type, anchor FROM `ai-memory`')).toEqual({
      type: 'never',
      anchor: 'entity',
    });
  });

  it('waits while its parts are only accepted, and is declined when all are kept', async () => {
    const actionUuid = await proposed(session(), {
      kind: 'revise',
      target: 'diary-entry:2026-10-13',
      text: 'body',
      mode: 'proofread',
      corrections,
    });
    // The owner's word, given on the screen and left without applying.
    decideParts(actionUuid, { c1: 'accepted', c2: 'accepted' });
    await settleActions([findAction(actionUuid)!]);
    expect(findAction(actionUuid)?.state).toBe('pending');

    decideParts(actionUuid, { c1: 'kept', c2: 'kept' });
    await settleActions([findAction(actionUuid)!]);
    expect(findAction(actionUuid)?.state).toBe('rejected');
  });

  it('takes from the editor only what the saved text shows made', async () => {
    const actionUuid = await proposed(session(), {
      kind: 'revise',
      target: 'diary-entry:2026-10-13',
      text: 'body',
      mode: 'proofread',
      corrections,
    });
    // The editor says both were taken, but the form saved only the first.
    context.rawDb
      .prepare("UPDATE content SET data = ? WHERE contentUuid = 'c-2'")
      .run(
        JSON.stringify({
          blocks: [
            {
              id: 'b1',
              type: 'paragraph',
              data: { text: 'Finished the boss of the first level today.' },
            },
            {
              id: 'b2',
              type: 'paragraph',
              data: { text: 'Tomorow I will draw the second one.' },
            },
          ],
        }),
      );
    markTakenInEditor(actionUuid, { c1: 'accepted', c2: 'accepted' });
    expect(findAction(actionUuid)).toMatchObject({
      state: 'pending',
      parts: [
        { id: 'c1', state: 'applied' },
        { id: 'c2', state: 'pending' },
      ],
    });
  });

  it('refuses a second correction of the same words', async () => {
    const { results } = await propose(session(), {
      kind: 'revise',
      target: 'diary-entry:2026-10-13',
      text: 'body',
      mode: 'proofread',
      corrections: [
        { find: 'the bos of', replace: 'the boss of', reason: 'A letter' },
        { find: 'bos of the', replace: 'boss of the', reason: 'A letter' },
      ],
    });
    const actionUuid = (results[0] as { actionUuid: string }).actionUuid;
    expect(findAction(actionUuid)!.payload).toMatchObject({
      parts: [{ id: 'c1', find: 'the bos of' }],
    });
    expect(results[0]).toMatchObject({
      dropped: [expect.stringMatching(/overlap another correction/)],
    });
  });

  describe('mending links', () => {
    const link = (id: string, words: string, fragment?: string) =>
      `<a data-content-link="entity" data-entity-type="project" data-entity-id="${id}"${fragment ? ` data-entity-fragment="${fragment}"` : ''}>${words}</a>`;
    const linksBlock = () =>
      JSON.parse(
        one("SELECT data FROM content WHERE contentUuid = 'c-2'")!.data,
      ).blocks[2].data.text as string;

    beforeEach(() => {
      context.rawDb
        .prepare(
          "INSERT INTO content (contentUuid, ownerType, ownerId, slot, data, createdAt, updatedAt) VALUES ('c-3', 'project', ?, 'project-description', ?, 1, 1)",
        )
        .run(
          PROJECT,
          JSON.stringify({
            blocks: [
              {
                id: 'h1',
                type: 'header',
                data: { text: 'Outcomes', level: 2 },
              },
            ],
          }),
        );
      const data = JSON.parse(
        one("SELECT data FROM content WHERE contentUuid = 'c-2'")!.data,
      );
      data.blocks.push({
        id: 'b3',
        type: 'paragraph',
        data: {
          text: `See ${link(PROJECT, 'the results', 'results')}, ${link('p-gone', 'the old one')} and ${link(PROJECT, 'the outcomes', 'outcomes')}.`,
        },
      });
      context.rawDb
        .prepare("UPDATE content SET data = ? WHERE contentUuid = 'c-2'")
        .run(JSON.stringify(data));
    });

    it('points a link at the heading it became and takes one to nothing off, its words kept', async () => {
      const actionUuid = await proposed(session(), {
        kind: 'revise',
        target: 'diary-entry:2026-10-13',
        text: 'body',
        mode: 'relink',
        relinks: [
          {
            link: 'b3/0/0',
            to: `thei:project/${PROJECT}#outcomes`,
            reason: 'Renamed',
          },
          { link: 'b3/0/1', to: null, reason: 'Gone' },
        ],
      });
      expect(findAction(actionUuid)!.payload).toMatchObject({
        mode: 'relink',
        parts: [
          {
            id: 'l1',
            type: 'relink',
            words: 'the results',
            from: `thei:project/${PROJECT}#results`,
            fromTitle: 'Parapet › results',
            toTitle: 'Parapet › Outcomes',
          },
          { id: 'l2', type: 'relink', to: null, fromTitle: '' },
        ],
      });
      const before = linksBlock();
      await applyActions({ actionUuids: [actionUuid], by: 'owner' });
      expect(linksBlock()).toBe(
        `See ${link(PROJECT, 'the results', 'outcomes')}, the old one and ${link(PROJECT, 'the outcomes', 'outcomes')}.`,
      );
      expect(findAction(actionUuid)?.state).toBe('applied');

      await undoAction(actionUuid);
      expect(linksBlock()).toBe(before);
    });

    it('mends only what is broken, as only a gone target may lose its link', async () => {
      const { results } = await propose(session(), {
        kind: 'revise',
        target: 'diary-entry:2026-10-13',
        text: 'body',
        mode: 'relink',
        relinks: [
          { link: 'b3/0/0', to: null },
          { link: 'b3/0/2', to: `thei:project/${PROJECT}` },
          { link: 'b3/0/1', to: `thei:project/${PROJECT}#nowhere` },
          { link: 'b3/0/9', to: `thei:project/${PROJECT}` },
        ],
      });
      expect(results[0]).toMatchObject({
        refused: expect.stringMatching(/Nothing left to propose/),
      });
      const refused = (results[0] as { refused: string }).refused;
      expect(refused).toMatch(/b3\/0\/0: what it led to is still there/);
      expect(refused).toMatch(/b3\/0\/2: it leads where it says/);
      expect(refused).toMatch(/b3\/0\/1: .*no heading of it has that anchor/);
      expect(refused).toMatch(/b3\/0\/9: no link stands there now/);
    });

    it('finds a link again when one before it in its field was taken off', async () => {
      const data = JSON.parse(
        one("SELECT data FROM content WHERE contentUuid = 'c-2'")!.data,
      );
      data.blocks.push({
        id: 'b4',
        type: 'paragraph',
        data: {
          text: `${link('p-gone', 'first')} then ${link(PROJECT, 'second', 'results')}`,
        },
      });
      context.rawDb
        .prepare("UPDATE content SET data = ? WHERE contentUuid = 'c-2'")
        .run(JSON.stringify(data));
      const actionUuid = await proposed(session(), {
        kind: 'revise',
        target: 'diary-entry:2026-10-13',
        text: 'body',
        mode: 'relink',
        relinks: [
          { link: 'b4/0/0', to: null },
          {
            link: 'b4/0/1',
            to: `thei:project/${PROJECT}#outcomes`,
            certainty: 'unsure',
          },
        ],
      });
      // The sure one goes first; the other one still waits, not overtaken.
      await applyActions({ actionUuids: [actionUuid], by: 'owner' });
      await settleActions([findAction(actionUuid)!]);
      expect(findAction(actionUuid)).toMatchObject({
        state: 'pending',
        parts: [
          { id: 'l1', state: 'applied' },
          { id: 'l2', state: 'pending' },
        ],
      });
      await applyActions({
        actionUuids: [actionUuid],
        by: 'owner',
        parts: { [actionUuid]: { l2: 'accepted' } },
      });
      expect(findAction(actionUuid)?.state).toBe('applied');
      expect(
        JSON.parse(
          one("SELECT data FROM content WHERE contentUuid = 'c-2'")!.data,
        ).blocks[3].data.text,
      ).toBe(`first then ${link(PROJECT, 'second', 'outcomes')}`);
    });

    it('offers no mending the owner kept as it is', async () => {
      const relink = {
        link: 'b3/0/0',
        to: `thei:project/${PROJECT}#outcomes`,
      };
      const actionUuid = await proposed(session(), {
        kind: 'revise',
        target: 'diary-entry:2026-10-13',
        text: 'body',
        mode: 'relink',
        relinks: [relink],
      });
      decideParts(actionUuid, { l1: 'kept' });
      await settleActions([findAction(actionUuid)!]);
      expect(findAction(actionUuid)?.state).toBe('rejected');
      const again = await propose(session(), {
        kind: 'revise',
        target: 'diary-entry:2026-10-13',
        text: 'body',
        mode: 'relink',
        relinks: [relink],
      });
      expect(again.results[0]).toMatchObject({
        refused: expect.stringMatching(/kept it as it is/),
      });
    });
  });

  it('refuses a rewrite dressed as a correction', async () => {
    const { results } = await propose(session(), {
      kind: 'revise',
      target: 'diary-entry:2026-10-13',
      text: 'body',
      mode: 'proofread',
      corrections: [
        {
          find: 'Finished the bos of the first level today.',
          replace: 'Today the first boss fell at last.',
        },
      ],
    });
    expect(results[0]).toMatchObject({
      refused: expect.stringMatching(/rephrases rather than fixes/),
    });
  });
});

describe('making and deleting', () => {
  it('makes a project with the parts the owner kept, and takes it back', async () => {
    const actionUuid = await proposed(session(), {
      kind: 'create',
      entity: 'project',
      fields: {
        title: 'Thei',
        summary: 'An archive of a life',
        tags: ['Games', 'Archives'],
        sections: [
          { title: 'Prototype', body: 'First steps.' },
          { title: 'Release', body: 'Out at last.' },
        ],
      },
    });
    expect(findAction(actionUuid)?.parts).toEqual([
      { id: 'sections:0', state: 'pending' },
      { id: 'sections:1', state: 'pending' },
      { id: 'tags:0', state: 'pending' },
      { id: 'tags:1', state: 'pending' },
    ]);
    const outcome = await applyActions({
      actionUuids: [actionUuid],
      by: 'owner',
      parts: { [actionUuid]: { 'sections:1': 'kept', 'tags:1': 'kept' } },
    });
    const ref = outcome.applied[0]!.entity!;
    const id = ref.slice('project:'.length);
    expect(
      one('SELECT title, access FROM projects WHERE projectUuid = ?', id),
    ).toEqual({ title: 'Thei', access: 'private' });
    expect(
      context.rawDb
        .prepare(
          'SELECT title FROM `project-content-sections` WHERE projectUuid = ?',
        )
        .all(id),
    ).toEqual([{ title: 'Prototype' }]);
    expect(
      one('SELECT COUNT(*) AS n FROM `tag-usages` WHERE containerId = ?', id)
        ?.n,
    ).toBe(1);

    await undoAction(actionUuid);
    expect(
      one('SELECT projectUuid FROM projects WHERE projectUuid = ?', id),
    ).toBeUndefined();
  });

  it('takes back a made entity only while just actions changed it', async () => {
    const make = async () => {
      const actionUuid = await proposed(session(), {
        kind: 'create',
        entity: 'event',
        fields: {
          title: `Jam ${Math.random()}`,
          summary: 'A game jam',
          body: 'Two days.',
          periods: [{ startDate: '2026-05-01', endDate: '2026-05-02' }],
        },
      });
      const outcome = await applyActions({
        actionUuids: [actionUuid],
        by: 'owner',
      });
      await tick();
      return { actionUuid, ref: outcome.applied[0]!.entity! };
    };
    // An action's change since goes with it.
    const first = await make();
    const changed = await proposed(session(), {
      kind: 'field',
      target: first.ref,
      field: 'summary',
      value: 'Two days of games',
    });
    await applyActions({ actionUuids: [changed], by: 'owner' });
    await tick();
    await undoAction(first.actionUuid);
    const firstId = first.ref.slice('event:'.length);
    expect(
      one('SELECT eventUuid FROM events WHERE eventUuid = ?', firstId),
    ).toBeUndefined();

    // The owner's own change since stays, and so does the event.
    const second = await make();
    const secondId = second.ref.slice('event:'.length);
    const event = (await THEI_SERVER.events.findByUuid(secondId))!;
    const form = (await readEventEdit(event)) as unknown as EventEditData;
    expect(
      (await saveEventEdit(secondId, { ...form, reminder: 'Mine now' })).type,
    ).toBe('success');
    await expect(undoAction(second.actionUuid)).rejects.toThrow(
      /changed again since/,
    );
  });

  it('makes a section of a project, and takes it back', async () => {
    const actionUuid = await proposed(session(), {
      kind: 'create',
      target: `project:${PROJECT}`,
      entity: 'project-section',
      fields: { title: 'Prototype', body: 'First steps.' },
    });
    const outcome = await applyActions({
      actionUuids: [actionUuid],
      by: 'owner',
    });
    expect(outcome.applied[0]!.entity).toMatch(/^project-section:/);
    expect(
      one(
        'SELECT COUNT(*) AS n FROM `project-content-sections` WHERE projectUuid = ?',
        PROJECT,
      )?.n,
    ).toBe(1);
    await undoAction(actionUuid);
    expect(
      one(
        'SELECT COUNT(*) AS n FROM `project-content-sections` WHERE projectUuid = ?',
        PROJECT,
      )?.n,
    ).toBe(0);
  });

  it('refuses a second entry for a day, and deletes for good', async () => {
    const { results } = await propose(session(), {
      kind: 'create',
      entity: 'diary-entry',
      fields: { date: '2026-10-13', body: 'Again.' },
    });
    expect(results[0]).toMatchObject({
      refused: expect.stringMatching(/one a day/),
    });
    const deletion = await proposed(session(), {
      kind: 'delete',
      target: 'diary-entry:2026-10-13',
      reason: 'Said elsewhere',
    });
    await applyActions({ actionUuids: [deletion], by: 'owner' });
    expect(
      one('SELECT diaryUuid FROM `diary-entries` WHERE diaryUuid = ?', DIARY),
    ).toBeUndefined();
    await expect(undoAction(deletion)).rejects.toThrow(/final/);
  });
});

describe('files an action needs', () => {
  it('are found in fields and texts, and held while it waits', async () => {
    expect([
      ...assetIdsIn({
        banner: 'a-banner',
        files: [{ file: 'a-file', title: 'Notes' }],
        body: 'Look: ::media[A cat]{asset="a-cat" layout="centered"}',
      }),
    ]).toEqual(['a-banner', 'a-file', 'a-cat']);
    context.rawDb
      .prepare(
        "INSERT INTO `ai-actions` (actionUuid, sessionUuid, kind, payload, certainty, state, fingerprint, assetUuids, createdAt) VALUES ('aia-1', 's', 'update', '{}', 'sure', 'pending', 'f', '[\"a-cat\"]', 1)",
      )
      .run();
    expect([...assetsHeldByAi(['a-cat', 'a-dog'])]).toEqual(['a-cat']);
    rejectActions(['aia-1']);
    expect([...assetsHeldByAi(['a-cat'])]).toEqual([]);
  });

  it('are found as a form keeps them, so a change that frees one holds it', () => {
    expect([
      ...assetIdsIn({
        iconAssetUuid: 'a-icon',
        otherAssets: [{ assetUuid: 'a-file', title: 'Notes' }],
        sections: [{ title: 'Prototype', bannerAssetUuid: 'a-banner' }],
        descriptionContent: {
          data: {
            blocks: [{ type: 'image', data: { file: { assetUuid: 'a-cat' } } }],
          },
        },
      }),
    ]).toEqual(['a-icon', 'a-file', 'a-banner', 'a-cat']);
  });
});

describe('a change of a form', () => {
  const ids = (results: { actionUuid?: string; refused?: string }[]) =>
    results.map((result) => {
      if (result.refused) throw new Error(result.refused);
      return result.actionUuid!;
    });

  it('takes a status line back with its undo', async () => {
    context.rawDb
      .prepare(
        "INSERT INTO statuses (id, ownerType, ownerId, kind, text, createdAt, date) VALUES ('st-1', 'project', ?, 'regular', 'Bilding the pier', 1, '2026-10-01')",
      )
      .run(PROJECT);
    const status = () =>
      one("SELECT text FROM statuses WHERE id = 'st-1'")!.text;
    const actionUuid = await proposed(session(), {
      kind: 'update',
      target: `project:${PROJECT}`,
      changes: { statuses: [{ id: 'st-1', text: 'Building the pier.' }] },
    });
    await applyActions({ actionUuids: [actionUuid], by: 'owner' });
    // A status is a caption: one sentence takes no full stop.
    expect(status()).toBe('Building the pier');
    await tick();
    await undoAction(actionUuid);
    expect(findAction(actionUuid)?.state).toBe('undone');
    expect(status()).toBe('Bilding the pier');
  });

  it('settles as applied once the form took it and was saved, lists too', async () => {
    const actionUuid = await proposed(session(), {
      kind: 'update',
      target: `project:${PROJECT}`,
      changes: {
        tags: ['Games', 'Remakes'],
        relations: [{ ref: 'diary-entry:2026-10-13', kind: 'related' }],
      },
    });
    const { after } = findAction(actionUuid)!.base as {
      after: Record<string, unknown>;
    };
    // The owner's form lays it in as it is kept, and saves.
    const loaded = await loadForm({ kind: 'project', id: PROJECT });
    const { statusTexts: _texts, ...form } = loaded.form;
    expect(
      (
        await saveProjectEdit(
          PROJECT,
          { ...form, ...after },
          { expectedUpdatedAt: loaded.version },
        )
      ).type,
    ).toBe('success');
    const [settled] = await settleActions([findAction(actionUuid)!]);
    expect(settled!.state).toBe('applied');
    // What the form holds already is no change at all.
    const { results } = await propose(session(), {
      kind: 'update',
      target: `project:${PROJECT}`,
      changes: { tags: ['games', 'Remakes'] },
    });
    expect(results[0]).toMatchObject({
      refused: expect.stringMatching(/changes nothing/),
    });
  });

  it('checks a title as its save settles it', async () => {
    const field = await proposed(session(), {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'title',
      value: 'Parapet II.',
    });
    expect(findAction(field)?.payload).toMatchObject({ value: 'Parapet II' });
    const { results } = await propose(session(), {
      kind: 'update',
      target: `project:${PROJECT}`,
      changes: { title: 'Parapet.' },
    });
    expect(results[0]).toMatchObject({
      refused: expect.stringMatching(/changes nothing/),
    });
  });

  it('keeps of a section only the section, whatever its project’s other sections do', async () => {
    const made = ids(
      (
        await propose(
          session(),
          {
            kind: 'create',
            target: `project:${PROJECT}`,
            entity: 'project-section',
            fields: { title: 'Prototype', body: 'First steps.' },
          },
          {
            kind: 'create',
            target: `project:${PROJECT}`,
            entity: 'project-section',
            fields: { title: 'Release', body: 'Out at last.' },
          },
        )
      ).results as never,
    );
    const outcome = await applyActions({ actionUuids: made, by: 'owner' });
    const [first, second] = outcome.applied.map((item) => item.entity!);
    const summaryOf = (ref: string) =>
      one(
        'SELECT summary FROM `project-content-sections` WHERE sectionUuid = ?',
        ref.slice('project-section:'.length),
      )!.summary;
    const change = await proposed(session(), {
      kind: 'update',
      target: first,
      changes: { summary: 'The first one' },
    });
    expect(findAction(change)?.base).toEqual({
      fields: ['summary'],
      before: { summary: '' },
      after: { summary: 'The first one' },
    });
    await tick();
    const other = await proposed(session(), {
      kind: 'field',
      target: second,
      field: 'summary',
      value: 'The last one',
    });
    await applyActions({ actionUuids: [other], by: 'owner' });
    expect((await settleActions([findAction(change)!]))[0]!.state).toBe(
      'pending',
    );
    await tick();
    await applyActions({ actionUuids: [change], by: 'owner' });
    expect(findAction(change)?.undo).toMatchObject({
      before: { summary: '' },
    });
    await tick();
    await undoAction(other);
    expect(await undoState(findAction(change)!)).toBe('ready');
    await undoAction(change);
    expect([summaryOf(first!), summaryOf(second!)]).toEqual(['', '']);
  });

  it('locks the form it writes, and the other ends of its relations', () => {
    expect(
      actionLocks({
        kind: 'update',
        payload: {
          kind: 'update',
          changes: {
            relations: [{ ref: 'diary-entry:2026-10-13', kind: 'related' }],
          },
        },
        targetType: 'project',
        targetId: PROJECT,
      }),
    ).toEqual([`project:${PROJECT}`, `diary-entry:${DIARY}`]);
  });
});

describe('a bundle', () => {
  it('lets a section made after a change of its project be undone', async () => {
    const { results } = await propose(
      session(),
      {
        kind: 'field',
        target: `project:${PROJECT}`,
        field: 'summary',
        value: 'A remake',
      },
      {
        kind: 'create',
        target: `project:${PROJECT}`,
        entity: 'project-section',
        fields: { title: 'Prototype', body: 'First steps.' },
      },
    );
    const [field, create] = results.map(
      (result) => (result as { actionUuid: string }).actionUuid,
    );
    await applyActions({ actionUuids: [field!, create!], by: 'owner' });
    expect(await undoState(findAction(create!)!)).toBe('ready');
    // Nor does a fact remembered of the project stand in its way.
    await tick();
    const remember = await proposed(session(), {
      kind: 'remember',
      target: `project:${PROJECT}`,
      text: 'The editor came first.',
    });
    await applyActions({ actionUuids: [remember], by: 'owner' });
    expect(await undoState(findAction(create!)!)).toBe('ready');
  });

  it('takes back a section it made when a later part of it fails', async () => {
    const { results } = await propose(
      session(),
      {
        kind: 'create',
        target: `project:${PROJECT}`,
        entity: 'project-section',
        fields: { title: 'Prototype', body: 'First steps.' },
      },
      // Made against the project as it is: the section moves it on.
      { kind: 'delete', target: `project:${PROJECT}`, reason: 'Done with it' },
    );
    const ids = results.map(
      (result) => (result as { actionUuid: string }).actionUuid,
    );
    const outcome = await applyActions({ actionUuids: ids, by: 'owner' });
    expect(outcome.failed?.actionUuid).toBe(ids[1]);
    expect(outcome.applied).toEqual([]);
    expect(outcome.changed).toContain(`project:${PROJECT}`);
    expect(
      one(
        'SELECT COUNT(*) AS n FROM `project-content-sections` WHERE projectUuid = ?',
        PROJECT,
      )?.n,
    ).toBe(0);
    expect(findAction(ids[0]!)).toMatchObject({ state: 'pending', undo: null });
  });

  it('that goes whole goes not at all once a part of it is overtaken', async () => {
    const { results } = await proposeActions({
      sessionUuid: session(),
      atomic: true,
      actions: [
        {
          kind: 'field',
          target: `project:${PROJECT}`,
          field: 'summary',
          value: 'A remake of a browser game',
        },
        {
          kind: 'field',
          target: `project:${PROJECT}`,
          field: 'title',
          value: 'Parapet II',
        },
      ],
    });
    const ids = results.map(
      (result) => (result as { actionUuid: string }).actionUuid,
    );
    context.rawDb
      .prepare(
        "UPDATE projects SET summary = 'Something else', updatedAt = 99 WHERE projectUuid = ?",
      )
      .run(PROJECT);
    await settleActions([findAction(ids[0]!)!]);
    expect(findAction(ids[0]!)?.state).toBe('stale');
    const outcome = await applyActions({ actionUuids: [ids[1]!], by: 'owner' });
    expect(outcome.applied).toEqual([]);
    expect(outcome.refused).toMatch(/whole bundle/);
  });

  it('that goes whole is not proposed without a version decided meanwhile', async () => {
    const sessionUuid = session();
    const first = await proposed(sessionUuid, {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'A remake',
    });
    const { results } = await proposeActions({
      sessionUuid,
      atomic: true,
      // The owner declines the old one while the new are checked.
      live: () => {
        context.rawDb
          .prepare(
            "UPDATE `ai-actions` SET state = 'rejected' WHERE actionUuid = ?",
          )
          .run(first);
        return true;
      },
      actions: [
        {
          kind: 'field',
          target: `project:${PROJECT}`,
          field: 'summary',
          value: 'A remake, again',
          supersedes: first,
        },
        {
          kind: 'field',
          target: `project:${PROJECT}`,
          field: 'title',
          value: 'Parapet II',
        },
      ],
    });
    expect(results).toEqual([
      {
        refused: expect.stringMatching(
          /was decided while this version was made/,
        ),
      },
      { refused: expect.stringMatching(/atomic bundle/) },
    ]);
    expect(
      // Nothing of it was made.
      one('SELECT COUNT(*) AS n FROM `ai-actions`')?.n,
    ).toBe(1);
  });
});

describe('a relation', () => {
  it('keeps its note as a relation does, and tells both ends they changed', async () => {
    const actionUuid = await proposed(session(), {
      kind: 'relation',
      target: `project:${PROJECT}`,
      other: 'diary-entry:2026-10-13',
      relation: 'related',
      note: 'The day the boss fell',
      reason: 'Named together',
      whyNotInlineLink: 'The day is a part of the work',
    });
    expect(findAction(actionUuid)?.payload).toMatchObject({
      note: { type: 'shared', text: 'The day the boss fell' },
    });
    const outcome = await applyActions({
      actionUuids: [actionUuid],
      by: 'owner',
    });
    expect(outcome.changed).toEqual(
      expect.arrayContaining([`project:${PROJECT}`, 'diary-entry:2026-10-13']),
    );
    expect(
      JSON.parse(one('SELECT note FROM `entity-relations`')!.note),
    ).toEqual({ type: 'shared', text: 'The day the boss fell' });
  });

  it('taken away is known by its pair, whatever word it is named by', async () => {
    const add = await proposed(session(), {
      kind: 'relation',
      target: `project:${PROJECT}`,
      other: 'diary-entry:2026-10-13',
      relation: 'related',
      reason: 'Named together',
      whyNotInlineLink: 'The day is a part of the work',
    });
    await applyActions({ actionUuids: [add], by: 'owner' });
    const removal = await proposed(session(), {
      kind: 'relation',
      op: 'remove',
      target: `project:${PROJECT}`,
      other: 'diary-entry:2026-10-13',
      reason: 'Not really',
    });
    rejectActions([removal], { never: true });
    const { results } = await propose(session(), {
      kind: 'relation',
      op: 'remove',
      target: 'diary-entry:2026-10-13',
      other: `project:${PROJECT}`,
      relation: 'affects',
      reason: 'Not really',
    });
    expect(results[0]).toMatchObject({
      refused: expect.stringMatching(/never to offer/),
    });
  });
});

describe('never again', () => {
  it('said of a declined action reaches a page watching its session', async () => {
    const sessionUuid = session();
    const actionUuid = await proposed(sessionUuid, {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'A remake',
    });
    rejectActions([actionUuid]);
    const heard: string[] = [];
    const stop = subscribeSession(sessionUuid, (signal) => {
      if (signal.type === 'actions') heard.push(...signal.actionUuids);
    });
    neverAgain(actionUuid);
    stop();
    expect(heard).toEqual([actionUuid]);
  });
});
