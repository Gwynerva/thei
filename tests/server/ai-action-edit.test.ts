import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_EDITABLE_KINDS,
  actionTexts,
  withActionTexts,
} from '../../shared/ai-action-texts';
import { AI_ACTION_KINDS, type AiActionKind } from '../../shared/ai-actions';
import { applyActions } from '../../server/thei/ai/actions/apply';
import {
  adoptTaken,
  editAction,
  proposalInputOf,
} from '../../server/thei/ai/actions/edit';
import { proposeActions } from '../../server/thei/ai/actions/propose';
import { actionDef } from '../../server/thei/ai/actions/registry';
import { findAction } from '../../server/thei/ai/actions/rows';
import { undoAction } from '../../server/thei/ai/actions/undo';
import { currentField } from '../../server/thei/ai/actions/current';
import {
  createSession,
  updateSession,
} from '../../server/thei/ai/sessions/store';
import { freshAiTestDb } from '../helpers/fresh-ai-db';

/**
 * The owner corrects a proposal's words: in its card before applying it,
 * or in a form it was taken into. The corrected proposal is checked as the
 * model's was, applied and undone as any other, and the model's own words
 * are kept beside the owner's — and not offered again.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const project = { kind: 'project', id: PROJECT } as const;

beforeEach(async () => {
  context = await freshAiTestDb();
  context.insert('profiles', { profileId: 'profile', displayName: 'Owner' });
  context.insert('projects', {
    projectUuid: PROJECT,
    title: 'Parapet',
    summary: 'A browser remake',
    access: 'public',
    humanReadableSlug: 'parapet',
    publicId: 'Parapet',
    createdAt: 1,
    updatedAt: 2,
  });
});

afterEach(async () => {
  await context.close();
});

/** Proposes one action in a session of its own and gives its id. */
async function proposed(action: Record<string, unknown>, sessionUuid?: string) {
  const session = sessionUuid ?? createSession({ origin: 'owner', title: 'S' });
  const { results } = await proposeActions({
    sessionUuid: session,
    actions: [{ reason: 'Clearer', ...action } as never],
  });
  const result = results[0] as { actionUuid?: string; refused?: string };
  if (!result.actionUuid) throw new Error(result.refused);
  return result.actionUuid;
}

const summaryOf = (value: string) => ({
  kind: 'field',
  target: `project:${PROJECT}`,
  field: 'summary',
  value,
});

describe('a proposal corrected in its card', () => {
  it('is applied with the owner’s words, the model’s kept beside them, and undone', async () => {
    const id = await proposed(summaryOf('A remake of a browser game'));
    await editAction(id, { value: 'A remake of an old browser game' });
    const row = findAction(id)!;
    expect(row.payload).toMatchObject({
      value: 'A remake of an old browser game',
    });
    expect(row.proposed).toMatchObject({ value: 'A remake of a browser game' });

    const outcome = await applyActions({ actionUuids: [id], by: 'owner' });
    expect(outcome.applied).toHaveLength(1);
    expect(currentField(project, 'summary')).toBe(
      'A remake of an old browser game',
    );
    await undoAction(id);
    expect(currentField(project, 'summary')).toBe('A browser remake');
  });

  it('drops the correction when the words go back to the model’s', async () => {
    const id = await proposed(summaryOf('A remake of a browser game'));
    await editAction(id, { value: 'Something else' });
    await editAction(id, { value: 'A remake of a browser game' });
    expect(findAction(id)!.proposed).toBeNull();
  });

  it('is refused words the entity holds already, and once decided or archived', async () => {
    const sessionUuid = createSession({ origin: 'owner', title: 'S' });
    const id = await proposed(summaryOf('A remake'), sessionUuid);
    await expect(editAction(id, { value: 'A browser remake' })).rejects.toThrow(
      /already/,
    );
    updateSession(sessionUuid, { archivedAt: Date.now() });
    await expect(editAction(id, { value: 'Other' })).rejects.toThrow(
      /archived/,
    );
    updateSession(sessionUuid, { archivedAt: null });
    await applyActions({ actionUuids: [id], by: 'owner' });
    await expect(editAction(id, { value: 'Other' })).rejects.toThrow(/decided/);
  });

  it('keeps the kind’s own checks: a title never ends with a full stop', async () => {
    const id = await proposed({
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'title',
      value: 'Parapet Remade',
    });
    await editAction(id, { value: 'Parapet, remade.' });
    expect(findAction(id)!.payload).toMatchObject({ value: 'Parapet, remade' });
  });

  it('is never offered again as the model first said it, once applied corrected', async () => {
    const sessionUuid = createSession({ origin: 'owner', title: 'S' });
    const id = await proposed(
      summaryOf('A remake of a browser game'),
      sessionUuid,
    );
    await editAction(id, { value: 'An old browser game, remade' });
    await applyActions({ actionUuids: [id], by: 'owner' });
    const { results } = await proposeActions({
      sessionUuid,
      actions: [
        {
          reason: 'Clearer',
          ...summaryOf('A remake of a browser game'),
        } as never,
      ],
    });
    expect(results[0]).toMatchObject({ refused: expect.any(String) });
  });
});

describe('a proposal taken into a form and corrected there', () => {
  /** The form saved with these words, as the admin's own save writes them. */
  function saved(summary: string) {
    context.rawDb
      .prepare(
        'UPDATE projects SET summary = ?, updatedAt = updatedAt + 1 WHERE projectUuid = ?',
      )
      .run(summary, PROJECT);
  }

  it('counts as applied by the owner with the words saved', async () => {
    const id = await proposed(summaryOf('A remake of a browser game'));
    saved('A remake of a browser game, by me');
    await adoptTaken(id, { value: 'A remake of a browser game, by me' });
    const row = findAction(id)!;
    expect(row).toMatchObject({ state: 'applied', appliedBy: 'owner' });
    expect(row.payload).toMatchObject({
      value: 'A remake of a browser game, by me',
    });
    expect(row.proposed).toMatchObject({ value: 'A remake of a browser game' });
  });

  it('is never taken on trust: words the entity does not read change nothing', async () => {
    const id = await proposed(summaryOf('A remake of a browser game'));
    await adoptTaken(id, { value: 'Words never saved' });
    expect(findAction(id)!.state).toBe('pending');
  });

  it('changed back to the words before, waits again', async () => {
    const id = await proposed(summaryOf('A remake of a browser game'));
    await adoptTaken(id, { value: 'A browser remake' });
    expect(findAction(id)!.state).toBe('pending');
  });
});

describe('every kind with words to correct', () => {
  const samples: Partial<Record<AiActionKind, Record<string, unknown>>> = {
    describe: { kind: 'describe', file: 'a-1', family: 'f-1', text: 'A cat.' },
    field: { kind: 'field', field: 'summary', value: 'Short.' },
    update: {
      kind: 'update',
      changes: { title: 'New', synonyms: ['bg3', 'бг3'], showcase: true },
    },
    create: {
      kind: 'create',
      entity: 'event',
      fields: { title: 'A day', summary: 'It was.' },
    },
    note: { kind: 'note', markdown: 'An idea.' },
    write: { kind: 'write', text: 'body', mode: 'append', markdown: 'More.' },
    remember: { kind: 'remember', about: 'entity', text: 'A fact.' },
    term: { kind: 'term', word: 'ЗГТ', note: 'A word.', forms: [], keep: true },
    'memory-compact': {
      kind: 'memory-compact',
      about: 'entity',
      facts: ['One.', 'Two.'],
    },
    relation: {
      kind: 'relation',
      op: 'add',
      other: 'event:e-1',
      relation: 'related',
      note: { type: 'split', currentText: 'Here.', relatedText: 'There.' },
      whyNotInlineLink: 'Because.',
    },
    tags: {
      kind: 'tags',
      add: [{ ref: 'tag:t-1', title: 'Old' }, { title: 'Fresh' }],
      remove: [],
    },
  };

  it('are exactly the kinds that carry the owner’s words, revise aside', () => {
    expect([...AI_EDITABLE_KINDS].sort()).toEqual(Object.keys(samples).sort());
    for (const kind of AI_ACTION_KINDS)
      if (!AI_EDITABLE_KINDS.has(kind))
        expect(actionTexts(kind, { kind })).toEqual([]);
  });

  it.each(Object.entries(samples))(
    '%s: its words go round unchanged, and read as a proposer would hand them in',
    (kind, payload) => {
      const texts = actionTexts(kind, payload);
      expect(texts.length).toBeGreaterThan(0);
      const same = Object.fromEntries(
        texts.map((text) => [text.key, text.value]),
      );
      expect(withActionTexts(kind, payload, same)).toEqual(payload);
      const changed = withActionTexts(
        kind,
        payload,
        Object.fromEntries(texts.map((text) => [text.key, 'Corrected'])),
      );
      expect(
        actionTexts(kind, changed).every((text) => text.value === 'Corrected'),
      ).toBe(true);
      const parsed = actionDef(kind as AiActionKind).schema.safeParse(
        proposalInputOf(kind, changed),
      );
      expect(parsed.success).toBe(true);
    },
  );
});

describe('the model, told of the owner’s corrections', () => {
  it('hears of each once, with the owner’s next words', async () => {
    const sessionUuid = createSession({ origin: 'app', title: 'S' });
    const id = await proposed(
      summaryOf('A remake of a browser game'),
      sessionUuid,
    );
    await editAction(id, { value: 'An old browser game, remade' });
    const { postOwnerMessage } =
      await import('../../server/thei/ai/sessions/owner');
    const { sessionMessages } =
      await import('../../server/thei/ai/sessions/store');
    const told = (messageUuid: string) =>
      JSON.stringify(
        sessionMessages(sessionUuid).find(
          (message) => message.messageUuid === messageUuid,
        )!.transcript,
      );
    const first = postOwnerMessage(sessionUuid, { text: 'Go on' });
    expect(told(first)).toContain(id);
    expect(told(first)).toContain('An old browser game, remade');
    const second = postOwnerMessage(sessionUuid, { text: 'And more' });
    expect(told(second)).not.toContain(id);
  });
});
