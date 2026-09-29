import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import { baselineSql } from '../../update/migrations';
import {
  discardContentDraft,
  dismissContentDraft,
  listOwnerDrafts,
  parseContentHistoryField,
  parseContentHistoryOwner,
  readFieldHistory,
  runContentHistoryMaintenance,
  syncContentDraft,
} from '../../server/thei/content/history';
import {
  applyPreparedContentSave,
  deleteContentForOwner,
} from '../../server/thei/content/repository';
import { findOrphanedAssets } from '../../server/thei/assets/repository/find-orphaned';
import {
  CONTENT_HISTORY_ABANDONED_DRAFT_MS,
  CONTENT_HISTORY_ACTIVE_DRAFT_MS,
  CONTENT_HISTORY_REVISION_TTL_MS,
  CONTENT_HISTORY_SLICE_MS,
  type ContentHistoryField,
} from '../../shared/content-history';
import type { ContentOutputData } from '../../shared/content';

let rawDb: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  rawDb = new Database(':memory:');
  for (const statement of baselineSql) rawDb.prepare(statement).run();
  db = drizzle(rawDb, { schema });
  Object.assign(globalThis, {
    THEI_SERVER: { useDb: () => ({ db, schema, rawDb }) },
  });
});

afterEach(() => {
  rawDb.close();
  delete (globalThis as any).THEI_SERVER;
});

const NEW_REF = 'new~0f8fad5b-d9cb-469f-a165-70867728950e';
const field: ContentHistoryField = {
  ownerType: 'page',
  ownerRef: 'pg-1',
  slot: 'page-body',
};

function words(count: number, word = 'word') {
  return Array.from({ length: count }, (_, index) => `${word}${index}`).join(
    ' ',
  );
}

function text(...paragraphs: string[]): ContentOutputData {
  return {
    blocks: paragraphs.map((value, index) => ({
      id: `b${index}`,
      type: 'paragraph',
      data: { text: value },
    })),
  };
}

function media(assetUuid: string, caption = ''): ContentOutputData {
  return {
    blocks: [
      {
        id: 'm',
        type: 'contentMedia',
        data: { layout: 'centered', caption, asset: { assetUuid } },
      },
    ],
  };
}

function rows() {
  return db.select().from(schema.contentHistory).all();
}

function sync(
  data: ContentOutputData,
  now: number,
  options: { writer?: string; hint?: 'before-restore' | 'before-clear' } = {},
  target: ContentHistoryField = field,
) {
  return syncContentDraft(
    { ...target, writer: options.writer ?? 'tab-1', data, hint: options.hint },
    now,
  );
}

function saveContent(
  data: ContentOutputData,
  options: { draftRef?: string; ownerId?: string; now?: number } = {},
) {
  const ownerId = options.ownerId ?? field.ownerRef;
  db.transaction((tx) => {
    applyPreparedContentSave(tx, schema, 'page', ownerId, 'page-body', {
      type: 'save',
      contentUuid: `c-${ownerId}`,
      changed: true,
      data,
      blockCount: data.blocks.length,
      wordCount: 0,
      assetCount: 0,
      assetTotalSize: 0,
      assetUsages: [],
      ...(options.draftRef ? { draftRef: options.draftRef } : {}),
    });
  });
}

function insertAsset(assetUuid: string, touchedAt: number) {
  rawDb
    .prepare(
      `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, settings, type, size, touchedAt)
       VALUES (?, ?, 'webp', ?, ?, 'k', '{}', 'image', 10, ?)`,
    )
    .run(assetUuid, assetUuid, assetUuid, assetUuid, touchedAt);
}

describe('content drafts', () => {
  it('keeps one draft per field and tab, and overwrites it while writing goes on', () => {
    sync(text('One'), 1_000);
    sync(text('One two'), 2_000);
    sync(text('One two three'), 3_000);

    const all = rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ kind: 'draft', writer: 'tab-1' });
    expect(all[0]!.data.blocks[0]!.data.text).toBe('One two three');
  });

  it('stores no draft for text that is what is saved', () => {
    saveContent(text('Saved'));
    expect(sync(text('Saved'), 1_000).draft).toBeNull();
    expect(rows().filter((row) => row.kind === 'draft')).toHaveLength(0);

    sync(text('Saved and more'), 2_000);
    // Typed back to what is saved: the draft protects nothing any more.
    expect(sync(text('Saved'), 3_000).draft).toBeNull();
    expect(rows().filter((row) => row.kind === 'draft')).toHaveLength(0);
  });

  it('turns the draft into a version every few minutes of writing', () => {
    sync(text('First'), 0);
    sync(text('First second'), CONTENT_HISTORY_SLICE_MS - 1);
    expect(rows()).toHaveLength(1);

    sync(text('First second third'), CONTENT_HISTORY_SLICE_MS);
    const history = readFieldHistory(field);
    expect(history.revisions).toHaveLength(1);
    expect(history.revisions[0]).toMatchObject({ reason: 'auto' });
    // A version shows when its text was last written.
    expect(history.revisions[0]!.updatedAt).toBe(CONTENT_HISTORY_SLICE_MS - 1);
    expect(history.drafts[0]?.wordCount).toBe(3);
  });

  it('keeps the text before a large deletion at once', () => {
    sync(text(words(150)), 0);
    sync(text(words(20)), 1_000);

    const history = readFieldHistory(field);
    expect(history.revisions.map((row) => row.reason)).toEqual(['large-drop']);
    expect(history.revisions[0]!.wordCount).toBe(150);
  });

  it('keeps the text before a restore or a clear when the editor says so', () => {
    sync(text('Before'), 0);
    sync(text('Restored'), 1_000, { hint: 'before-restore' });
    sync(text(''), 2_000, { hint: 'before-clear' });

    expect(readFieldHistory(field).revisions.map((row) => row.reason)).toEqual([
      'before-clear',
      'before-restore',
    ]);
  });

  it('never keeps the same text twice in a row', () => {
    sync(text('Same'), 0);
    sync(text('Other'), 1_000, { hint: 'before-restore' });
    sync(text('Same'), 2_000, { hint: 'before-restore' });
    // "Other" is kept; going back to "Same" keeps "Other" once, not again.
    sync(text('Other'), 3_000, { hint: 'before-restore' });

    const reasons = readFieldHistory(field).revisions.map((row) => row.reason);
    expect(reasons).toHaveLength(3);
  });

  it('keeps a draft for each tab, and tells each about the others', () => {
    sync(text('From the first tab'), 0, { writer: 'tab-1' });
    sync(text('From the second tab'), 1_000, { writer: 'tab-2' });
    const answer = sync(text('First tab again'), 2_000, { writer: 'tab-1' });

    // Neither overwrote the other, and nothing was set aside.
    const history = readFieldHistory(field);
    expect(history.revisions).toEqual([]);
    expect(history.drafts.map((row) => row.writer)).toEqual(['tab-1', 'tab-2']);
    expect(answer.draft?.writer).toBe('tab-1');
    expect(answer.others).toMatchObject([
      { writer: 'tab-2', wordCount: 4, updatedAt: 1_000 },
    ]);
  });

  it('lets a tab that writes what another tab keeps go on with that draft', () => {
    sync(text('Mine'), 0, { writer: 'tab-1' });
    sync(text('Theirs'), 1_000, { writer: 'tab-2' });
    // Tab 1 takes up tab 2's text: tab 1's own text is kept as a version,
    // and tab 2's copy is not kept twice.
    sync(text('Theirs'), 2_000, { writer: 'tab-1', hint: 'before-restore' });

    const history = readFieldHistory(field);
    expect(history.drafts.map((row) => row.writer)).toEqual(['tab-1']);
    expect(history.revisions.map((row) => row.reason)).toEqual([
      'before-restore',
    ]);
  });

  it('lets another editor take over the same text without a version', () => {
    sync(text('Same'), 0, { writer: 'tab-1' });
    sync(text('Same'), 1_000, { writer: 'tab-2' });
    const all = rows();
    expect(all).toHaveLength(1);
    expect(all[0]!.writer).toBe('tab-2');
  });

  it('keeps a discarded text and protects what the form still holds', () => {
    saveContent(text('Saved'));
    sync(text('Typed in the editor'), 1_000);

    const draft = discardContentDraft(
      { ...field, writer: 'tab-1', replacement: text('Written into the form') },
      2_000,
    );
    expect(draft.draft?.wordCount).toBe(4);
    const history = readFieldHistory(field);
    expect(history.revisions.map((row) => row.reason)).toEqual(['discarded']);

    // A form holding what is saved needs no draft.
    discardContentDraft(
      { ...field, writer: 'tab-1', replacement: text('Saved') },
      3_000,
    );
    expect(readFieldHistory(field).drafts).toEqual([]);
  });

  it('leaves the drafts of other tabs alone when one discards', () => {
    sync(text('Other tab'), 0, { writer: 'tab-2' });
    sync(text('This tab'), 1_000, { writer: 'tab-1' });
    discardContentDraft({ ...field, writer: 'tab-1' }, 2_000);
    expect(readFieldHistory(field).drafts.map((row) => row.writer)).toEqual([
      'tab-2',
    ]);
  });

  it('keeps a dismissed draft as a version', () => {
    const { draft } = sync(text('Unwanted'), 0);
    expect(dismissContentDraft(draft!.id, 1_000)).toBe(true);
    expect(readFieldHistory(field)).toMatchObject({
      drafts: [],
      revisions: [{ reason: 'dismissed' }],
    });
    expect(dismissContentDraft(draft!.id, 2_000)).toBe(false);
  });

  it('lists the drafts of things never created, newest first', () => {
    sync(text('Old attempt'), 0, {}, { ...field, ownerRef: NEW_REF });
    sync(
      text('New attempt'),
      1_000,
      {},
      { ...field, ownerRef: 'new~1c9a6f0e-7a1f-4a57-9d55-5f1b3a9c2f10' },
    );
    const drafts = listOwnerDrafts('page', 'new');
    expect(drafts.map((draft) => draft.ownerRef)).toEqual([
      'new~1c9a6f0e-7a1f-4a57-9d55-5f1b3a9c2f10',
      NEW_REF,
    ]);
    expect(listOwnerDrafts('page', 'pg-1')).toEqual([]);
  });
});

describe('saving content', () => {
  it('keeps the text a save replaces and lets the matching draft go', () => {
    saveContent(text('Version one'), { now: 0 });
    sync(text('Version two'), 1_000);
    saveContent(text('Version two'));

    const history = readFieldHistory(field);
    expect(history.drafts).toEqual([]);
    expect(history.revisions.map((row) => row.reason)).toEqual(['replaced']);
    expect(history.revisions[0]!.wordCount).toBe(2);
  });

  it('sets aside idle drafts of other tabs once the text changes', () => {
    const now = 10 * CONTENT_HISTORY_ACTIVE_DRAFT_MS;
    vi.setSystemTime(now);
    try {
      saveContent(text('Version one'));
      sync(text('Left by a closed tab'), 0, { writer: 'tab-2' });
      sync(text('Still being written'), now - 1_000, { writer: 'tab-3' });
      // Saving the same text again decides nothing: every draft stays.
      saveContent(text('Version one'));
      expect(readFieldHistory(field).drafts).toHaveLength(2);

      saveContent(text('Version two'));
      const history = readFieldHistory(field);
      expect(history.drafts.map((row) => row.writer)).toEqual(['tab-3']);
      expect(
        history.revisions.find((row) => row.writer === 'tab-2')?.reason,
      ).toBe('displaced');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a text that was cleared and saved', () => {
    saveContent(text('Precious text'));
    db.transaction((tx) => {
      applyPreparedContentSave(tx, schema, 'page', 'pg-1', 'page-body', {
        type: 'delete',
        existingContentUuid: 'c-pg-1',
      });
    });
    expect(readFieldHistory(field).revisions.map((row) => row.reason)).toEqual([
      'cleared',
    ]);
  });

  it('hands the history of new text over to the owner once it exists', () => {
    const newField = { ...field, ownerRef: NEW_REF };
    sync(text(words(150)), 0, {}, newField);
    sync(text(words(10)), 1_000, {}, newField);
    saveContent(text(words(10)), { ownerId: 'pg-2', draftRef: NEW_REF });

    expect(rows().some((row) => row.ownerRef === NEW_REF)).toBe(false);
    const history = readFieldHistory({ ...field, ownerRef: 'pg-2' });
    expect(history.drafts).toEqual([]);
    expect(history.revisions.map((row) => row.reason)).toEqual(['large-drop']);
  });

  it('keeps what a deleted owner held, saved or not', () => {
    saveContent(text('Saved body'));
    sync(text('Unsaved notes'), 0, {}, { ...field, slot: 'page-notes' });
    db.transaction((tx) => deleteContentForOwner(tx, schema, 'page', 'pg-1'));

    expect(readFieldHistory(field).revisions.map((row) => row.reason)).toEqual([
      'deleted',
    ]);
    expect(
      readFieldHistory({ ...field, slot: 'page-notes' }).revisions.map(
        (row) => row.reason,
      ),
    ).toEqual(['deleted']);
    expect(rows().every((row) => row.kind === 'revision')).toBe(true);
  });
});

describe('keeping the history small', () => {
  it('lets versions go after two days and abandoned new drafts after a week', () => {
    sync(text('Old'), 0);
    sync(text('Newer'), 1_000, { hint: 'before-restore' });
    sync(text('Never created'), 0, {}, { ...field, ownerRef: NEW_REF });

    expect(
      runContentHistoryMaintenance(CONTENT_HISTORY_REVISION_TTL_MS),
    ).toEqual({ abandoned: 0, expired: 0 });
    expect(
      runContentHistoryMaintenance(CONTENT_HISTORY_REVISION_TTL_MS + 1_001),
    ).toEqual({ abandoned: 0, expired: 1 });

    const week = CONTENT_HISTORY_ABANDONED_DRAFT_MS + 1;
    expect(runContentHistoryMaintenance(week)).toMatchObject({ abandoned: 1 });
    // The abandoned draft now lives two more days as a version.
    const abandoned = readFieldHistory({ ...field, ownerRef: NEW_REF });
    expect(abandoned.revisions.map((row) => row.reason)).toEqual(['abandoned']);
    expect(
      runContentHistoryMaintenance(week + CONTENT_HISTORY_REVISION_TTL_MS + 1),
    ).toMatchObject({ expired: 1 });
    // The draft of the existing owner is unsaved work and never expires.
    expect(readFieldHistory(field).drafts).toHaveLength(1);
  });
});

describe('files shown by drafts and versions', () => {
  it('are kept by cleanup while a row refers to them, then get a day of grace', async () => {
    const day = 24 * 60 * 60 * 1000;
    insertAsset('a-kept', 0);
    insertAsset('a-free', 0);

    sync(media('a-kept'), 10 * day);
    sync(text('No picture any more'), 10 * day + 1_000, {
      hint: 'before-clear',
    });

    const orphans = await findOrphanedAssets(20 * day);
    expect(orphans.map((row) => row.assetUuid)).toEqual(['a-free']);

    // The version goes; the file it showed is touched as it is let go.
    runContentHistoryMaintenance(
      10 * day + 1_000 + CONTENT_HISTORY_REVISION_TTL_MS + 1,
    );
    const kept = db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.assetUuid, 'a-kept'))
      .get();
    expect(kept!.touchedAt).toBe(
      10 * day + 1_000 + CONTENT_HISTORY_REVISION_TTL_MS + 1,
    );
  });
});

describe('request parsing', () => {
  it('accepts real owners and slots only', () => {
    expect(
      parseContentHistoryField({
        ownerType: 'page',
        ownerRef: 'pg-1',
        slot: 'page-body',
      }),
    ).toEqual({ ownerType: 'page', ownerRef: 'pg-1', slot: 'page-body' });
    expect(
      parseContentHistoryField({
        ownerType: 'page',
        ownerRef: NEW_REF,
        slot: 'page-body',
      }),
    ).toBeTruthy();
    expect(
      parseContentHistoryField({
        ownerType: 'page',
        ownerRef: 'new',
        slot: 'page-body',
      }),
    ).toBeUndefined();
    expect(
      parseContentHistoryField({
        ownerType: 'page',
        ownerRef: 'new~bogus',
        slot: 'page-body',
      }),
    ).toBeUndefined();
    expect(
      parseContentHistoryField({
        ownerType: 'nope',
        ownerRef: 'pg-1',
        slot: 'page-body',
      }),
    ).toBeUndefined();
    expect(
      parseContentHistoryOwner(
        { ownerType: 'page', ownerRef: 'new' },
        { allowNewPlaceholder: true },
      ),
    ).toEqual({ ownerType: 'page', ownerRef: 'new' });
  });
});
