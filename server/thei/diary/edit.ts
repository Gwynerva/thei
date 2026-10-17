import { validateDiaryData } from '#layers/thei/shared/admin/diary';
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
  const [content, notes, relations] = await Promise.all([
    THEI_SERVER.content.buildFieldValue('diary-entry', diaryUuid, 'diary-body'),
    THEI_SERVER.content.buildFieldValue(
      'diary-entry',
      diaryUuid,
      'diary-notes',
    ),
    getRelations({ type: 'diary-entry', id: diaryUuid }),
  ]);
  if (!content)
    throw createError({
      statusCode: 500,
      message: 'Diary entry content is missing',
    });
  return {
    diaryUuid,
    version: stored.updatedAt,
    date: stored.date,
    access: stored.access,
    content,
    relations,
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
    if (contentSave.type !== 'save')
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
      options.onWrite?.(tx, schema);
    });
    return {
      type: 'success',
      diaryUuid,
      version: storedVersion('diary-entry', diaryUuid),
      date: result.date,
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
  options: Pick<EntityEditOptions, 'onWrite' | 'beforeWrite'> = {},
) {
  const diaryUuid = stored.diaryUuid;
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    options.beforeWrite?.(tx, schema);
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
