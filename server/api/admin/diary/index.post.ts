import { validateDiaryData } from '#layers/thei/shared/admin/diary';
import type { DiaryEditData } from '#layers/thei/shared/diary';
import type { DiarySaveResponse } from '#layers/thei/shared/api/diary';
import { EntityPrefix, generateUniqueId } from '../../../thei/entity-id';
import {
  prepareContentForSave,
  applyPreparedContentSave,
} from '../../../thei/content/repository';
import { applyRelations, prepareRelations } from '../../../thei/relations';

export default defineEventHandler(async (event): Promise<DiarySaveResponse> => {
  const body = await readBody<DiaryEditData>(event);
  const result = validateDiaryData(body);
  if (typeof result === 'string') return { type: 'error', message: result };
  // One entry per day, strictly. The form is meant to send the editor to the
  // existing entry instead of getting here, so this is the last line rather
  // than the expected path.
  if (await THEI_SERVER.diary.findByDate(result.date))
    return {
      type: 'error',
      code: 'date-taken',
      message: THEI_SERVER.phrase.diary_date_already_taken,
    };

  const diaryUuid = await generateUniqueId(
    EntityPrefix.DiaryEntry,
    async (id) => !(await THEI_SERVER.diary.findByUuid(id)),
  );
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
      return { type: 'error', message: 'Diary entry content is required' };

    const { db, schema } = THEI_SERVER.useDb();
    const now = Date.now();
    db.transaction((tx) => {
      tx.insert(schema.diaryEntries)
        .values({
          diaryUuid,
          date: result.date,
          access: result.access,
          reminder: result.reminder ?? '',
          createdAt: now,
          updatedAt: now,
        })
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
    return { type: 'success', diaryUuid, date: result.date };
  } catch (error) {
    return {
      type: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to create diary entry',
    };
  }
});
