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
} from '../../../thei/content/repository';
import {
  applyRelations,
  deleteRelations,
  getRelations,
  prepareRelations,
} from '../../../thei/relations';

export default defineEventHandler(async (event) => {
  const diaryUuid = getRouterParam(event, 'diaryUuid')!;
  const stored = await THEI_SERVER.diary.findByUuid(diaryUuid);
  if (!stored)
    throw createError({ statusCode: 404, message: 'Diary entry not found' });

  if (event.method === 'GET') {
    const [content, relations] = await Promise.all([
      THEI_SERVER.content.buildFieldValue(
        'diary-entry',
        diaryUuid,
        'diary-body',
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
      date: stored.date,
      access: stored.access,
      content,
      relations,
      reminder: stored.reminder,
    } satisfies DiaryGetResponse;
  }

  if (event.method === 'PUT') {
    const body = await readBody<DiaryEditData>(event);
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

    try {
      const [contentSave, relations] = await Promise.all([
        prepareContentForSave(
          'diary-entry',
          diaryUuid,
          'diary-body',
          result.content,
        ),
        prepareRelations(
          { type: 'diary-entry', id: diaryUuid },
          result.relations,
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
        applyRelations(
          tx,
          schema,
          { type: 'diary-entry', id: diaryUuid },
          relations,
        );
      });
      return {
        type: 'success',
        diaryUuid,
        date: result.date,
      } satisfies DiarySaveResponse;
    } catch (error) {
      return {
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to save diary entry',
      } satisfies DiarySaveResponse;
    }
  }

  if (event.method === 'DELETE') {
    const { db, schema } = THEI_SERVER.useDb();
    db.transaction((tx) => {
      deleteRelations(tx, schema, { type: 'diary-entry', id: diaryUuid });
      deleteContentForOwner(tx, schema, 'diary-entry', diaryUuid);
      tx.delete(schema.diaryEntries)
        .where(eq(schema.diaryEntries.diaryUuid, diaryUuid))
        .run();
    });
    return;
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
