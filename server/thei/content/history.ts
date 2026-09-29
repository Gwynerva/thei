import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, like, lt, sql } from 'drizzle-orm';
import {
  CONTENT_OWNER_TYPES,
  CONTENT_SLOTS,
  canonicalizeContentData,
  collectContentAssetUuids,
  contentSemanticKey,
  summarizeContentData,
  type ContentOutputData,
  type ContentOwnerType,
  type ContentSlot,
} from '#layers/thei/shared/content';
import {
  CONTENT_HISTORY_ABANDONED_DRAFT_MS,
  CONTENT_HISTORY_ACTIVE_DRAFT_MS,
  CONTENT_HISTORY_FIELD_CAP,
  CONTENT_HISTORY_NEW_REF_PREFIX,
  CONTENT_HISTORY_REVISION_TTL_MS,
  CONTENT_HISTORY_SLICE_MS,
  contentDigestOfKey,
  isLargeContentDrop,
  isNewContentOwnerRef,
  type ContentHistoryEntryMeta,
  type ContentHistoryField,
  type ContentHistoryHint,
  type ContentHistoryIndexResponse,
  type ContentHistoryReason,
  type ContentHistorySyncResponse,
} from '#layers/thei/shared/content-history';
import { isOneOf } from '#layers/thei/shared/utils/isOneOf';

/**
 * The server side of content history: the drafts of a field and the versions
 * they leave behind.
 *
 * Each tab keeps a draft of its own, told apart by `writer`. Two tabs writing
 * one field keep two drafts, each offered to the other, and neither
 * overwrites what the other wrote.
 *
 * A version is never sent as such. An editor sends its current text, and
 * before its draft row is overwritten the rules here decide whether the row
 * is kept as a version instead: when the editor says it is about to restore
 * or clear, when the new text loses much of the old one, or when the row has
 * been collecting writing for a few minutes. Saving a text keeps the one it
 * replaced. Every version lives two days.
 *
 * Rows refer to files by `assetUuids`, and asset cleanup leaves those files
 * alone while a row refers to them. A file a row stops referring to is
 * touched, so it gets the same day of grace as any file that falls out of use.
 */

type Row =
  typeof import('../db/schema/content-history').contentHistory.$inferSelect;

interface DescribedData {
  data: ContentOutputData;
  key: string;
  digest: string;
  wordCount: number;
  blockCount: number;
  assetCount: number;
  size: number;
  assetUuids: string[];
}

export function describeHistoryData(value: unknown): DescribedData {
  const data = canonicalizeContentData(value as ContentOutputData);
  const key = contentSemanticKey(data);
  const { wordCount, blockCount, assetCount } = summarizeContentData(data);
  return {
    data,
    key,
    digest: contentDigestOfKey(key),
    wordCount,
    blockCount,
    assetCount,
    size: JSON.stringify(data).length,
    assetUuids: collectContentAssetUuids(data),
  };
}

function isEmpty(described: DescribedData) {
  return described.data.blocks.length === 0;
}

function newHistoryId() {
  return `ch-${randomUUID()}`;
}

export function historyEntryMeta(row: Row): ContentHistoryEntryMeta {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerRef: row.ownerRef,
    slot: row.slot,
    kind: row.kind,
    ...(row.reason ? { reason: row.reason } : {}),
    digest: row.digest,
    writer: row.writer,
    wordCount: row.wordCount,
    blockCount: row.blockCount,
    assetCount: row.assetCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function fieldWhere(schema: any, field: ContentHistoryField) {
  return and(
    eq(schema.contentHistory.ownerType, field.ownerType),
    eq(schema.contentHistory.ownerRef, field.ownerRef),
    eq(schema.contentHistory.slot, field.slot),
  );
}

/** The drafts of a field, one per writer, newest first. */
function fieldDrafts(tx: any, schema: any, field: ContentHistoryField): Row[] {
  return tx
    .select()
    .from(schema.contentHistory)
    .where(
      and(fieldWhere(schema, field), eq(schema.contentHistory.kind, 'draft')),
    )
    .orderBy(desc(schema.contentHistory.updatedAt))
    .all();
}

function latestRevision(
  tx: any,
  schema: any,
  field: ContentHistoryField,
): Pick<Row, 'digest'> | undefined {
  return tx
    .select({ digest: schema.contentHistory.digest })
    .from(schema.contentHistory)
    .where(
      and(
        fieldWhere(schema, field),
        eq(schema.contentHistory.kind, 'revision'),
      ),
    )
    .orderBy(desc(schema.contentHistory.createdAt))
    .get();
}

/**
 * The semantic key of what is saved in the field, or of nothing when the
 * owner does not exist yet or keeps no text there.
 */
function savedKey(tx: any, schema: any, field: ContentHistoryField): string {
  const row = field.ownerRef.startsWith(CONTENT_HISTORY_NEW_REF_PREFIX)
    ? undefined
    : tx
        .select({ data: schema.content.data })
        .from(schema.content)
        .where(
          and(
            eq(schema.content.ownerType, field.ownerType),
            eq(schema.content.ownerId, field.ownerRef),
            eq(schema.content.slot, field.slot),
          ),
        )
        .get();
  return contentSemanticKey(row?.data ?? { blocks: [] });
}

function insertRow(
  tx: any,
  schema: any,
  field: ContentHistoryField,
  described: DescribedData,
  row: {
    kind: 'draft' | 'revision';
    reason?: ContentHistoryReason;
    writer?: string;
    createdAt: number;
    updatedAt: number;
  },
) {
  const id = newHistoryId();
  tx.insert(schema.contentHistory)
    .values({
      id,
      ownerType: field.ownerType,
      ownerRef: field.ownerRef,
      slot: field.slot,
      kind: row.kind,
      reason: row.reason ?? null,
      data: described.data,
      digest: described.digest,
      wordCount: described.wordCount,
      blockCount: described.blockCount,
      assetCount: described.assetCount,
      size: described.size,
      assetUuids: described.assetUuids,
      writer: row.writer ?? '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
    .run();
  return tx
    .select()
    .from(schema.contentHistory)
    .where(eq(schema.contentHistory.id, id))
    .get() as Row;
}

/**
 * Keeps a saved text that is about to be replaced, cleared or deleted, unless
 * the latest version of the field already says the same.
 */
function recordRevision(
  tx: any,
  schema: any,
  field: ContentHistoryField,
  described: DescribedData,
  reason: ContentHistoryReason,
  writtenAt: number,
  now: number,
) {
  if (isEmpty(described)) return;
  if (latestRevision(tx, schema, field)?.digest === described.digest) return;
  insertRow(tx, schema, field, described, {
    kind: 'revision',
    reason,
    createdAt: now,
    updatedAt: writtenAt,
  });
  enforceFieldCap(tx, schema, field, now);
}

/**
 * Turns the draft row into a version. The version lives from now on; it shows
 * the time its text was last written.
 */
function retireDraft(
  tx: any,
  schema: any,
  draft: Row,
  reason: ContentHistoryReason,
  now: number,
) {
  const field = draft as ContentHistoryField;
  // An empty draft protects nothing, and one the latest version already
  // repeats would only be a second copy of it.
  const kept =
    (draft.data?.blocks?.length ?? 0) > 0 &&
    latestRevision(tx, schema, field)?.digest !== draft.digest;
  if (!kept) {
    tx.delete(schema.contentHistory)
      .where(eq(schema.contentHistory.id, draft.id))
      .run();
    touchReleasedAssets(tx, schema, draft.assetUuids, now);
    return;
  }
  tx.update(schema.contentHistory)
    .set({ kind: 'revision', reason, createdAt: now })
    .where(eq(schema.contentHistory.id, draft.id))
    .run();
  enforceFieldCap(tx, schema, field, now);
}

function retireReason(
  draft: Row,
  next: DescribedData,
  hint: ContentHistoryHint | undefined,
  now: number,
): ContentHistoryReason | undefined {
  if (hint) return hint;
  if (isLargeContentDrop(draft, next)) return 'large-drop';
  if (now - draft.createdAt >= CONTENT_HISTORY_SLICE_MS) return 'auto';
  return undefined;
}

/** Writes new text into a draft row in place. */
function rewriteDraft(
  tx: any,
  schema: any,
  draft: Row,
  described: DescribedData,
  now: number,
): Row {
  const values = {
    data: described.data,
    digest: described.digest,
    wordCount: described.wordCount,
    blockCount: described.blockCount,
    assetCount: described.assetCount,
    size: described.size,
    assetUuids: described.assetUuids,
    updatedAt: now,
  };
  tx.update(schema.contentHistory)
    .set(values)
    .where(eq(schema.contentHistory.id, draft.id))
    .run();
  claimAssets(tx, schema, described.assetUuids, draft.assetUuids, now);
  touchReleasedAssets(
    tx,
    schema,
    draft.assetUuids.filter((uuid) => !described.assetUuids.includes(uuid)),
    now,
  );
  return { ...draft, ...values };
}

/** Another tab's draft becomes this writer's to go on with. */
function takeOverDraft(
  tx: any,
  schema: any,
  draft: Row,
  writer: string,
  now: number,
): Row {
  tx.update(schema.contentHistory)
    .set({ writer, updatedAt: now })
    .where(eq(schema.contentHistory.id, draft.id))
    .run();
  return { ...draft, writer, updatedAt: now };
}

function insertDraft(
  tx: any,
  schema: any,
  field: ContentHistoryField,
  described: DescribedData,
  writer: string,
  now: number,
): Row {
  claimAssets(tx, schema, described.assetUuids, [], now);
  return insertRow(tx, schema, field, described, {
    kind: 'draft',
    writer,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Writes what an editor holds now as its draft of the field.
 *
 * The writer's draft is `null` when the field needs none because the text is
 * what is saved. Another tab's draft saying exactly the same is the same
 * work: the writer goes on with it rather than keeping a second copy.
 */
export function syncContentDraft(
  input: ContentHistoryField & {
    writer: string;
    data: unknown;
    hint?: ContentHistoryHint;
  },
  now = Date.now(),
): ContentHistorySyncResponse {
  const described = describeHistoryData(input.data);
  const field: ContentHistoryField = {
    ownerType: input.ownerType,
    ownerRef: input.ownerRef,
    slot: input.slot,
  };
  const { db, schema } = THEI_SERVER.useDb();
  return db.transaction((tx) => {
    const isSaved = savedKey(tx, schema, field) === described.key;
    const drafts = fieldDrafts(tx, schema, field);
    let own = drafts.find((row) => row.writer === input.writer);
    const twins = drafts.filter(
      (row) => row !== own && row.digest === described.digest,
    );
    const others = drafts
      .filter((row) => row !== own && !twins.includes(row))
      .map(historyEntryMeta);

    if (own && own.digest !== described.digest) {
      const reason = retireReason(own, described, input.hint, now);
      if (reason) {
        retireDraft(tx, schema, own, reason, now);
        own = undefined;
      }
    }

    if (isSaved) {
      for (const row of own ? [own, ...twins] : twins)
        deleteRow(tx, schema, row, now);
      return { draft: null, others };
    }

    let draft: Row;
    if (own)
      draft =
        own.digest === described.digest
          ? own
          : rewriteDraft(tx, schema, own, described, now);
    else {
      const twin = twins.shift();
      draft = twin
        ? takeOverDraft(tx, schema, twin, input.writer, now)
        : insertDraft(tx, schema, field, described, input.writer, now);
    }
    for (const twin of twins) deleteRow(tx, schema, twin, now);
    return { draft: historyEntryMeta(draft), others };
  });
}

/**
 * The editor was closed without saving: its text is kept as a version, and
 * what the form still holds becomes the writer's draft unless it is what is
 * saved. Other tabs' drafts are theirs and stay.
 */
export function discardContentDraft(
  input: ContentHistoryField & {
    writer: string;
    replacement?: unknown;
  },
  now = Date.now(),
): ContentHistorySyncResponse {
  const replacement =
    input.replacement === undefined || input.replacement === null
      ? undefined
      : describeHistoryData(input.replacement);
  const field: ContentHistoryField = {
    ownerType: input.ownerType,
    ownerRef: input.ownerRef,
    slot: input.slot,
  };
  const { db, schema } = THEI_SERVER.useDb();
  return db.transaction((tx) => {
    const drafts = fieldDrafts(tx, schema, field);
    const own = drafts.find((row) => row.writer === input.writer);
    if (own) retireDraft(tx, schema, own, 'discarded', now);
    const rest = drafts.filter((row) => row !== own);
    if (
      !replacement ||
      isEmpty(replacement) ||
      savedKey(tx, schema, field) === replacement.key
    )
      return { draft: null, others: rest.map(historyEntryMeta) };
    const twin = rest.find((row) => row.digest === replacement.digest);
    const draft = twin
      ? takeOverDraft(tx, schema, twin, input.writer, now)
      : insertDraft(tx, schema, field, replacement, input.writer, now);
    return {
      draft: historyEntryMeta(draft),
      others: rest.filter((row) => row !== twin).map(historyEntryMeta),
    };
  });
}

/** The owner declined a draft: it is kept as a version, and offered no more. */
export function dismissContentDraft(id: string, now = Date.now()): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  return db.transaction((tx) => {
    const draft = tx
      .select()
      .from(schema.contentHistory)
      .where(
        and(
          eq(schema.contentHistory.id, id),
          eq(schema.contentHistory.kind, 'draft'),
        ),
      )
      .get() as Row | undefined;
    if (!draft) return false;
    retireDraft(tx, schema, draft, 'dismissed', now);
    return true;
  });
}

function deleteRow(tx: any, schema: any, row: Row, now: number) {
  tx.delete(schema.contentHistory)
    .where(eq(schema.contentHistory.id, row.id))
    .run();
  touchReleasedAssets(tx, schema, row.assetUuids, now);
}

// --- Saving and deleting content -------------------------------------------

/**
 * Called inside the transaction that saves a content field: keeps the text it
 * replaces, hands over the history of a text written before its owner
 * existed, and lets the drafts go that say what was just saved.
 *
 * When the text changed, a draft of another tab idle for a while is set aside
 * as a version: the text was decided on after it, and offering it forever
 * would only nag. A tab still writing keeps its draft.
 */
export function recordContentSave(
  tx: any,
  schema: any,
  input: {
    ownerType: ContentOwnerType;
    ownerId: string;
    slot: ContentSlot;
    previous?: { data: ContentOutputData; updatedAt: number };
    saved: ContentOutputData;
    draftRef?: string;
  },
  now = Date.now(),
) {
  const field: ContentHistoryField = {
    ownerType: input.ownerType,
    ownerRef: input.ownerId,
    slot: input.slot,
  };
  if (input.draftRef && input.draftRef !== input.ownerId)
    adoptHistory(
      tx,
      schema,
      { ...field, ownerRef: input.draftRef },
      field,
      now,
    );

  const saved = describeHistoryData(input.saved);
  const previous = input.previous && describeHistoryData(input.previous.data);
  const changed = previous ? previous.key !== saved.key : !isEmpty(saved);
  if (previous && changed)
    recordRevision(
      tx,
      schema,
      field,
      previous,
      isEmpty(saved) ? 'cleared' : 'replaced',
      input.previous!.updatedAt,
      now,
    );

  for (const draft of fieldDrafts(tx, schema, field)) {
    if (draft.digest === saved.digest) deleteRow(tx, schema, draft, now);
    else if (
      changed &&
      now - draft.updatedAt >= CONTENT_HISTORY_ACTIVE_DRAFT_MS
    )
      retireDraft(tx, schema, draft, 'displaced', now);
  }
}

/**
 * Called inside the transaction that deletes an owner's content: what it
 * held, saved or not, stays in the history for two days.
 */
export function recordContentDeletion(
  tx: any,
  schema: any,
  ownerType: ContentOwnerType,
  ownerId: string,
  saved: { slot: ContentSlot; data: ContentOutputData; updatedAt: number }[],
  now = Date.now(),
) {
  for (const row of saved) {
    recordRevision(
      tx,
      schema,
      { ownerType, ownerRef: ownerId, slot: row.slot },
      describeHistoryData(row.data),
      'deleted',
      row.updatedAt,
      now,
    );
  }
  const drafts = tx
    .select()
    .from(schema.contentHistory)
    .where(
      and(
        eq(schema.contentHistory.ownerType, ownerType),
        eq(schema.contentHistory.ownerRef, ownerId),
        eq(schema.contentHistory.kind, 'draft'),
      ),
    )
    .all() as Row[];
  for (const draft of drafts) retireDraft(tx, schema, draft, 'deleted', now);
}

/**
 * Moves the history written under `new~<uuid>` to the owner that now exists.
 * Should a tab have gained a second draft of the field that way, its older
 * one is kept as a version.
 */
function adoptHistory(
  tx: any,
  schema: any,
  from: ContentHistoryField,
  to: ContentHistoryField,
  now: number,
) {
  tx.update(schema.contentHistory)
    .set({ ownerRef: to.ownerRef })
    .where(fieldWhere(schema, from))
    .run();
  const writers = new Set<string>();
  for (const draft of fieldDrafts(tx, schema, to)) {
    if (writers.has(draft.writer))
      retireDraft(tx, schema, draft, 'displaced', now);
    else writers.add(draft.writer);
  }
}

// --- Reading ----------------------------------------------------------------

/**
 * The drafts of an owner's fields, newest first. For `new`, the drafts of
 * everything of that kind never created: a new form offers the latest one it
 * did not write itself. They are few, since such drafts go after a week.
 */
export function listOwnerDrafts(
  ownerType: ContentOwnerType,
  ownerRef: string,
): ContentHistoryEntryMeta[] {
  const { db, schema } = THEI_SERVER.useDb();
  return (
    db
      .select()
      .from(schema.contentHistory)
      .where(
        and(
          eq(schema.contentHistory.ownerType, ownerType),
          ownerRef === 'new'
            ? like(
                schema.contentHistory.ownerRef,
                `${CONTENT_HISTORY_NEW_REF_PREFIX}%`,
              )
            : eq(schema.contentHistory.ownerRef, ownerRef),
          eq(schema.contentHistory.kind, 'draft'),
        ),
      )
      .orderBy(desc(schema.contentHistory.updatedAt))
      .all() as Row[]
  ).map(historyEntryMeta);
}

export function readFieldHistory(
  field: ContentHistoryField,
): ContentHistoryIndexResponse {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      id: schema.contentHistory.id,
      ownerType: schema.contentHistory.ownerType,
      ownerRef: schema.contentHistory.ownerRef,
      slot: schema.contentHistory.slot,
      kind: schema.contentHistory.kind,
      reason: schema.contentHistory.reason,
      digest: schema.contentHistory.digest,
      writer: schema.contentHistory.writer,
      wordCount: schema.contentHistory.wordCount,
      blockCount: schema.contentHistory.blockCount,
      assetCount: schema.contentHistory.assetCount,
      createdAt: schema.contentHistory.createdAt,
      updatedAt: schema.contentHistory.updatedAt,
    })
    .from(schema.contentHistory)
    .where(fieldWhere(schema, field))
    .orderBy(desc(schema.contentHistory.updatedAt))
    .all() as Row[];
  const metas = rows.map(historyEntryMeta);
  return {
    drafts: metas.filter((row) => row.kind === 'draft'),
    revisions: metas.filter((row) => row.kind === 'revision'),
  };
}

export function findHistoryEntry(id: string): Row | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.contentHistory)
    .where(eq(schema.contentHistory.id, id))
    .get() as Row | undefined;
}

// --- Files ------------------------------------------------------------------

/** SQL for "some history row refers to this asset", with `alias` the assets row. */
export function assetHeldByHistorySql(assetUuidColumn: unknown) {
  return sql`EXISTS (SELECT 1 FROM "content-history" h, json_each(h.assetUuids) j WHERE j.value = ${assetUuidColumn})`;
}

/** Of the given assets, the ones some history row still refers to. */
export function assetsHeldByHistory(
  assetUuids: readonly string[],
): Set<string> {
  if (!assetUuids.length) return new Set();
  const { rawDb } = THEI_SERVER.useDb();
  const held = new Set<string>();
  for (const chunk of chunks(assetUuids, 500)) {
    const rows = rawDb
      .prepare(
        `SELECT DISTINCT j.value AS assetUuid FROM "content-history" h, json_each(h.assetUuids) j WHERE j.value IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as { assetUuid: string }[];
    for (const row of rows) held.add(row.assetUuid);
  }
  return held;
}

/**
 * A file a draft starts to refer to is touched, so a cleanup that picked it
 * as a candidate a moment ago sees it as fresh and leaves it.
 */
function claimAssets(
  tx: any,
  schema: any,
  next: readonly string[],
  previous: readonly string[],
  now: number,
) {
  const added = next.filter((uuid) => !previous.includes(uuid));
  if (!added.length) return;
  tx.update(schema.assets)
    .set({ touchedAt: now })
    .where(
      and(
        inArray(schema.assets.assetUuid, added),
        sql`NOT EXISTS (SELECT 1 FROM "asset-usages" u WHERE u.assetUuid = ${schema.assets.assetUuid})`,
      ),
    )
    .run();
}

/**
 * Files nothing refers to any more — no usage, no history row — are touched,
 * so they get the day of grace every file that falls out of use gets.
 */
export function touchReleasedAssets(
  tx: any,
  schema: any,
  assetUuids: readonly string[],
  now: number,
) {
  const unique = [...new Set(assetUuids)];
  for (const chunk of chunks(unique, 500)) {
    tx.update(schema.assets)
      .set({ touchedAt: now })
      .where(
        and(
          inArray(schema.assets.assetUuid, chunk),
          sql`NOT EXISTS (SELECT 1 FROM "asset-usages" u WHERE u.assetUuid = ${schema.assets.assetUuid})`,
          sql`NOT ${assetHeldByHistorySql(schema.assets.assetUuid)}`,
        ),
      )
      .run();
  }
}

// --- Keeping it small -------------------------------------------------------

function enforceFieldCap(
  tx: any,
  schema: any,
  field: ContentHistoryField,
  now: number,
) {
  const revisions = tx
    .select({
      id: schema.contentHistory.id,
      size: schema.contentHistory.size,
      assetUuids: schema.contentHistory.assetUuids,
    })
    .from(schema.contentHistory)
    .where(
      and(
        fieldWhere(schema, field),
        eq(schema.contentHistory.kind, 'revision'),
      ),
    )
    .orderBy(desc(schema.contentHistory.createdAt))
    .all() as Pick<Row, 'id' | 'size' | 'assetUuids'>[];
  let total = 0;
  const excess: typeof revisions = [];
  // The newest version is always kept, however large it is.
  for (const [index, revision] of revisions.entries()) {
    total += revision.size;
    if (index > 0 && total > CONTENT_HISTORY_FIELD_CAP) excess.push(revision);
  }
  if (!excess.length) return;
  tx.delete(schema.contentHistory)
    .where(
      inArray(
        schema.contentHistory.id,
        excess.map((revision) => revision.id),
      ),
    )
    .run();
  touchReleasedAssets(
    tx,
    schema,
    excess.flatMap((revision) => revision.assetUuids),
    now,
  );
}

/**
 * Lets versions go once they are two days old, and turns drafts of things
 * never created into versions after a week untouched.
 */
export function runContentHistoryMaintenance(now = Date.now()) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.transaction((tx) => {
    const abandoned = tx
      .select()
      .from(schema.contentHistory)
      .where(
        and(
          eq(schema.contentHistory.kind, 'draft'),
          like(
            schema.contentHistory.ownerRef,
            `${CONTENT_HISTORY_NEW_REF_PREFIX}%`,
          ),
          lt(
            schema.contentHistory.updatedAt,
            now - CONTENT_HISTORY_ABANDONED_DRAFT_MS,
          ),
        ),
      )
      .all() as Row[];
    for (const draft of abandoned)
      retireDraft(tx, schema, draft, 'abandoned', now);

    const expired = tx
      .select({
        id: schema.contentHistory.id,
        assetUuids: schema.contentHistory.assetUuids,
      })
      .from(schema.contentHistory)
      .where(
        and(
          eq(schema.contentHistory.kind, 'revision'),
          lt(
            schema.contentHistory.createdAt,
            now - CONTENT_HISTORY_REVISION_TTL_MS,
          ),
        ),
      )
      .all() as Pick<Row, 'id' | 'assetUuids'>[];
    for (const chunk of chunks(expired, 500)) {
      tx.delete(schema.contentHistory)
        .where(
          inArray(
            schema.contentHistory.id,
            chunk.map((row) => row.id),
          ),
        )
        .run();
    }
    touchReleasedAssets(
      tx,
      schema,
      expired.flatMap((row) => row.assetUuids),
      now,
    );
    return { abandoned: abandoned.length, expired: expired.length };
  });
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

// --- Requests ---------------------------------------------------------------

/**
 * Reads an owner address from a request: a real kind of owner, and either
 * its id or `new~<uuid>`. The bare `new` is accepted only where a form
 * asks what it could pick up before its owner exists.
 */
export function parseContentHistoryOwner(
  value: Record<string, unknown>,
  options: { allowNewPlaceholder?: boolean } = {},
): Pick<ContentHistoryField, 'ownerType' | 'ownerRef'> | undefined {
  const { ownerType, ownerRef } = value;
  if (!isOneOf(ownerType, CONTENT_OWNER_TYPES)) return undefined;
  if (typeof ownerRef !== 'string') return undefined;
  const valid = isNewContentOwnerRef(ownerRef)
    ? true
    : ownerRef === 'new'
      ? Boolean(options.allowNewPlaceholder)
      : !ownerRef.startsWith(CONTENT_HISTORY_NEW_REF_PREFIX) &&
        /^[\w-]{1,120}$/.test(ownerRef);
  return valid ? { ownerType, ownerRef } : undefined;
}

export function parseContentHistoryField(
  value: Record<string, unknown>,
): ContentHistoryField | undefined {
  const owner = parseContentHistoryOwner(value);
  if (!owner || !isOneOf(value.slot, CONTENT_SLOTS)) return undefined;
  return { ...owner, slot: value.slot };
}

export function parseContentHistoryWriter(value: unknown): string | undefined {
  return typeof value === 'string' && /^[\w-]{1,64}$/.test(value)
    ? value
    : undefined;
}
