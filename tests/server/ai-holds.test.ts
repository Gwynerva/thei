import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  proposeActions,
  type ActionProposal,
} from '../../server/thei/ai/actions/propose';
import { applyActions } from '../../server/thei/ai/actions/apply';
import { releaseSettledHolds } from '../../server/thei/ai/actions/release';
import { findAction } from '../../server/thei/ai/actions/rows';
import { undoAction, undoState } from '../../server/thei/ai/actions/undo';
import { loadForm } from '../../server/thei/ai/forms/load';
import { maintainAiSessions } from '../../server/thei/ai/sessions/lifecycle';
import { createSession } from '../../server/thei/ai/sessions/store';
import { assetsHeldByAi } from '../../server/thei/assets/holds';
import { runContentHistoryMaintenance } from '../../server/thei/content/history';
import { readStoredText, saveText } from '../../server/thei/entity-patch/text';
import { saveProjectEdit } from '../../server/thei/projects/edit';
import { freshAiTestDb } from '../helpers/fresh-ai-db';

/**
 * What applied actions hold for their undo — the text each replaced, the
 * files each brought — let go once the undo can no longer happen, in a
 * pinned session too, and kept while a later undo may still bring it back.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const DIARY = 'd-1';
const BODY = {
  ownerType: 'diary-entry' as const,
  ownerId: DIARY,
  slot: 'diary-body' as const,
};
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  context = await freshAiTestDb();
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
          data: { text: 'Finished the bos of the first level today.' },
        },
        {
          id: 'b2',
          type: 'paragraph',
          data: { text: 'Tomorow I will draw the second one.' },
        },
      ],
    },
    createdAt: 1,
    updatedAt: 5,
  });
  context.rawDb
    .prepare(
      `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, settings, type, size, touchedAt)
       VALUES ('a-notes', 'notes', 'pdf', 'af-notes', 'h-notes', 'original', '{"type":"original"}', 'other', 10, 1)`,
    )
    .run();
});

afterEach(async () => {
  await context.close();
});

const one = (sql: string, ...params: unknown[]) =>
  context.rawDb.prepare(sql).get(...params) as Record<string, any> | undefined;
// Two writes within a millisecond would share a version.
const tick = () => new Promise((resolve) => setTimeout(resolve, 3));

/** A session the owner pinned: it is never purged. */
function pinnedSession() {
  const sessionUuid = createSession({ origin: 'owner', title: 'Kept' });
  context.rawDb
    .prepare('UPDATE `ai-sessions` SET pinned = 1 WHERE sessionUuid = ?')
    .run(sessionUuid);
  return sessionUuid;
}

async function applied(action: ActionProposal) {
  const { results } = await proposeActions({
    sessionUuid: pinnedSession(),
    actions: [action],
  });
  const result = results[0]!;
  if ('refused' in result) throw new Error(result.refused);
  const outcome = await applyActions({
    actionUuids: [result.actionUuid],
    by: 'owner',
  });
  expect(outcome.failed).toBeUndefined();
  return result.actionUuid;
}

const fix = (find: string, replace: string): ActionProposal => ({
  kind: 'revise',
  target: 'diary-entry:2026-10-13',
  text: 'body',
  mode: 'proofread',
  corrections: [{ find, replace, category: 'spelling', reason: 'A typo' }],
});

const heldVersions = (actionUuid: string) =>
  one(
    'SELECT COUNT(*) AS n FROM `content-history` WHERE heldBy = ?',
    actionUuid,
  )!.n;

const words = () =>
  (readStoredText(BODY).data!.blocks as { data: { text: string } }[]).map(
    (block) => block.data.text,
  );

describe('what an applied action holds', () => {
  it('is kept while an undo of a later action may bring its own back', async () => {
    const original = words();
    const first = await applied(fix('bos', 'boss'));
    await tick();
    const second = await applied(fix('Tomorow', 'Tomorrow'));
    expect(await undoState(findAction(first)!)).toBe('changed');
    expect(await undoState(findAction(second)!)).toBe('ready');

    expect(await releaseSettledHolds()).toBe(0);
    expect(heldVersions(first)).toBe(1);
    expect(heldVersions(second)).toBe(1);

    // The later one undone, the first reads as it left the text again.
    await undoAction(second);
    expect(await undoState(findAction(first)!)).toBe('ready');
    await tick();
    await undoAction(first);
    expect(words()).toEqual(original);
  });

  it('lets go of a text once the owner moved on, and it is swept as any other', async () => {
    const first = await applied(fix('bos', 'boss'));
    const left = readStoredText(BODY);
    await tick();
    await saveText(
      BODY,
      { blocks: [{ id: 'b1', type: 'paragraph', data: { text: 'Mine.' } }] },
      { expectedVersion: left.version, allowEmpty: false },
    );
    expect(await undoState(findAction(first)!)).toBe('changed');

    const now = Date.now();
    await maintainAiSessions(now);
    expect(heldVersions(first)).toBe(0);
    expect(findAction(first)).toMatchObject({
      state: 'applied',
      undo: { released: { at: now, state: 'changed' } },
    });
    // Read as it left it again, it stays as it was found: what an undo
    // would put back may be gone by then.
    const mine = readStoredText(BODY);
    await tick();
    await saveText(BODY, left.data!, {
      expectedVersion: mine.version,
      allowEmpty: false,
    });
    expect(await undoState(findAction(first)!)).toBe('changed');
    await expect(undoAction(first)).rejects.toThrow(/changed again since/);
    // Not looked at again.
    expect(await releaseSettledHolds()).toBe(0);
    // The version it held lives as any other now: two days.
    const { expired } = runContentHistoryMaintenance(now + 3 * DAY_MS);
    expect(expired).toBeGreaterThan(0);
    expect(
      one(
        "SELECT COUNT(*) AS n FROM `content-history` WHERE reason = 'before-ai'",
      )!.n,
    ).toBe(0);
  });

  it('keeps a file while it may be undone, and lets it go after', async () => {
    const added = await applied({
      kind: 'update',
      target: `project:${PROJECT}`,
      changes: { files: [{ file: 'a-notes', title: 'Notes' }] },
    });
    expect(findAction(added)?.assetUuids).toEqual(['a-notes']);
    expect(await releaseSettledHolds()).toBe(0);
    expect([...assetsHeldByAi(['a-notes'])]).toEqual(['a-notes']);

    // The owner takes the file off again in the form.
    await tick();
    const loaded = await loadForm({ kind: 'project', id: PROJECT });
    const { statusTexts: _texts, ...form } = loaded.form;
    expect(
      (
        await saveProjectEdit(
          PROJECT,
          { ...form, otherAssets: [] },
          { expectedUpdatedAt: loaded.version },
        )
      ).type,
    ).toBe('success');
    expect(await undoState(findAction(added)!)).toBe('changed');

    const now = Date.now() + 1000;
    expect(await releaseSettledHolds(now)).toBe(1);
    expect(findAction(added)?.assetUuids).toEqual([]);
    expect([...assetsHeldByAi(['a-notes'])]).toEqual([]);
    // Held by nothing now, it gets its day of grace from here.
    expect(
      one("SELECT touchedAt FROM assets WHERE assetUuid = 'a-notes'")!
        .touchedAt,
    ).toBe(now);
  });

  it('lets go of what a final change holds at once', async () => {
    const added = await applied({
      kind: 'update',
      target: `project:${PROJECT}`,
      changes: { files: [{ file: 'a-notes', title: 'Notes' }] },
    });
    // What it replaced was too large to keep: it cannot be undone.
    const row = findAction(added)!;
    context.rawDb
      .prepare('UPDATE `ai-actions` SET undo = ? WHERE actionUuid = ?')
      .run(JSON.stringify({ ...(row.undo as object), before: null }), added);
    expect(await undoState(findAction(added)!)).toBe('final');
    expect(await releaseSettledHolds()).toBe(1);
    expect([...assetsHeldByAi(['a-notes'])]).toEqual([]);
    expect(await undoState(findAction(added)!)).toBe('final');
  });
});
