import { validateDiaryData } from '#layers/thei/shared/admin/diary';
import { createEmptyContentFieldValue } from '#layers/thei/shared/content';
import {
  applyExcerpts,
  deleteExcerptsOfParent,
  detachExcerptsFromTarget,
  excerptIdentities,
  prepareExcerpts,
  readExcerptsForForm,
  type ExcerptsOnTargetDelete,
} from '../excerpts';
import type { DiaryEditData } from '#layers/thei/shared/diary';
import type {
  DiaryGetResponse,
  DiarySaveResponse,
} from '#layers/thei/shared/api/diary';
import { eq } from 'drizzle-orm';
import {
  prepareContentForSave,
  applyPreparedContentSave,
  deleteContentForOwner,
} from '../content/repository';
import {
  applyRelations,
  deleteRelations,
  getRelations,
  prepareRelations,
} from '../relations';
import { deleteShareLinks } from '../access-links/share-links';

import {
  assertEntityVersion,
  EntityEditConflict,
  type EntityEditOptions,
  storedVersion,
} from '../entity-edit';
import { forgetAiAnchors } from '../ai/memory/forget';

/**
 * A diary entry as its edit form reads and saves it — the admin form, and an AI client that reads the same form, changes what it was asked to and saves it back. Saving is a whole replace: whatever the form leaves out is cleared.
 */

/** The edit form, everything in it. */
export async function readDiaryEdit(
  stored: NonNullable<Awaited<ReturnType<typeof THEI_SERVER.diary.findByUuid>>>,
) {
  const diaryUuid = stored.diaryUuid;
  const [content, notes, relations, excerpts] = await Promise.all([
    THEI_SERVER.content.buildFieldValue('diary-entry', diaryUuid, 'diary-body'),
    THEI_SERVER.content.buildFieldValue(
      'diary-entry',
      diaryUuid,
      'diary-notes',
    ),
    getRelations({ type: 'diary-entry', id: diaryUuid }),
    readExcerptsForForm({ type: 'diary-entry', id: diaryUuid }),
  ]);
  // A day told by its excerpts alone keeps no text of its own; one left
  // with neither, by the deletion of what its excerpts were about, opens
  // in its form, which asks for a text or an excerpt before it saves.
  return {
    diaryUuid,
    version: stored.updatedAt,
    date: stored.date,
    access: stored.access,
    content: content ?? createEmptyContentFieldValue(),
    relations,
    excerpts,
    reminder: stored.reminder,
    notes,
  } satisfies DiaryGetResponse;
}

/** Saves the edit form over what it edits, or says what is wrong. */
export async function saveDiaryEdit(
  stored: NonNullable<Awaited<ReturnType<typeof THEI_SERVER.diary.findByUuid>>>,
  body: DiaryEditData,
  options: EntityEditOptions = {},
): Promise<DiarySaveResponse> {
  const diaryUuid = stored.diaryUuid;
  const result = validateDiaryData(body);
  if (typeof result === 'string')
    return { type: 'error', message: result } satisfies DiarySaveResponse;
  const onThatDay = await THEI_SERVER.diary.findByDate(result.date);
  if (onThatDay && onThatDay.diaryUuid !== diaryUuid)
    return {
      type: 'error',
      code: 'date-taken',
      message: THEI_SERVER.phrase.diary_date_already_taken,
    } satisfies DiarySaveResponse;
  let preparedRelations;
  try {
    preparedRelations = await prepareRelations(
      { type: 'diary-entry', id: diaryUuid },
      result.relations,
    );
  } catch (error) {
    return {
      type: 'error',
      message: error instanceof Error ? error.message : 'Invalid relations',
    } satisfies DiarySaveResponse;
  }
  const parent = { type: 'diary-entry', id: diaryUuid } as const;
  let preparedExcerpts: Awaited<ReturnType<typeof prepareExcerpts>>;
  try {
    preparedExcerpts = await prepareExcerpts(parent, result.excerpts);
  } catch (error) {
    return {
      type: 'error',
      message: error instanceof Error ? error.message : 'Invalid excerpts',
    } satisfies DiarySaveResponse;
  }
  // The text of the day is the entry, unless the day is told by the
  // excerpts it is saved with; one saved without its list of excerpts was
  // held to its text already (`validateDiaryData`).
  const hasExcerpts = Boolean(preparedExcerpts?.length);

  try {
    const [contentSave, notesSave] = await Promise.all([
      prepareContentForSave(
        'diary-entry',
        diaryUuid,
        'diary-body',
        result.content,
      ),
      prepareContentForSave(
        'diary-entry',
        diaryUuid,
        'diary-notes',
        result.notes,
      ),
    ]);
    if (contentSave.type !== 'save' && !hasExcerpts)
      return {
        type: 'error',
        message: 'Diary entry content is required',
      } satisfies DiarySaveResponse;

    const { db, schema } = THEI_SERVER.useDb();
    const now = Date.now();
    db.transaction((tx) => {
      assertEntityVersion(
        tx,
        schema.diaryEntries,
        schema.diaryEntries.diaryUuid,
        diaryUuid,
        options.expectedUpdatedAt,
      );
      tx.update(schema.diaryEntries)
        .set({
          date: result.date,
          access: result.access,
          reminder: result.reminder ?? '',
          updatedAt: now,
        })
        .where(eq(schema.diaryEntries.diaryUuid, diaryUuid))
        .run();
      applyPreparedContentSave(
        tx,
        schema,
        'diary-entry',
        diaryUuid,
        'diary-body',
        contentSave,
      );
      applyPreparedContentSave(
        tx,
        schema,
        'diary-entry',
        diaryUuid,
        'diary-notes',
        notesSave,
      );
      applyRelations(
        tx,
        schema,
        { type: 'diary-entry', id: diaryUuid },
        preparedRelations,
      );
      applyExcerpts(tx, schema, parent, preparedExcerpts);
      options.onWrite?.(tx, schema);
    });
    return {
      type: 'success',
      diaryUuid,
      version: storedVersion('diary-entry', diaryUuid),
      date: result.date,
      excerpts: excerptIdentities(preparedExcerpts),
    } satisfies DiarySaveResponse;
  } catch (error) {
    if (error instanceof EntityEditConflict)
      return {
        type: 'error',
        code: 'changed',
        message: error.message,
      } satisfies DiarySaveResponse;
    return {
      type: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to save diary entry',
    } satisfies DiarySaveResponse;
  }
}

/** Deletes it with everything that is its own. */
export async function deleteDiaryEntry(
  stored: NonNullable<Awaited<ReturnType<typeof THEI_SERVER.diary.findByUuid>>>,
  options: Pick<EntityEditOptions, 'onWrite' | 'beforeWrite'> & {
    /** What becomes of the excerpts about the entry. */
    excerpts?: ExcerptsOnTargetDelete;
  } = {},
) {
  const diaryUuid = stored.diaryUuid;
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    options.beforeWrite?.(tx, schema);
    deleteExcerptsOfParent(tx, schema, { type: 'diary-entry', id: diaryUuid });
    detachExcerptsFromTarget(
      tx,
      schema,
      { type: 'diary-entry', id: diaryUuid },
      options.excerpts ?? 'keep',
    );
    deleteRelations(tx, schema, { type: 'diary-entry', id: diaryUuid });
    deleteShareLinks(tx, schema, 'diary-entry', diaryUuid);
    deleteContentForOwner(tx, schema, 'diary-entry', diaryUuid);
    forgetAiAnchors(tx, schema, 'diary-entry', [diaryUuid]);
    tx.delete(schema.diaryEntries)
      .where(eq(schema.diaryEntries.diaryUuid, diaryUuid))
      .run();
    options.onWrite?.(tx, schema);
  });
  return;
}
