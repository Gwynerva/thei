import type { DiaryEditData } from '#layers/thei/shared/diary';
import { formVersion } from '../../../thei/entity-edit';
import {
  deleteDiaryEntry,
  readDiaryEdit,
  saveDiaryEdit,
} from '../../../thei/diary/edit';

export default defineEventHandler(async (event) => {
  const diaryUuid = getRouterParam(event, 'diaryUuid')!;
  const stored = await THEI_SERVER.diary.findByUuid(diaryUuid);
  if (!stored)
    throw createError({ statusCode: 404, message: 'Diary entry not found' });

  switch (event.method) {
    case 'GET':
      return readDiaryEdit(stored);
    case 'PUT': {
      const body = await readBody<DiaryEditData>(event);
      return saveDiaryEdit(stored, body, {
        expectedUpdatedAt: formVersion(body),
      });
    }
    case 'DELETE':
      await deleteDiaryEntry(stored);
      return;
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
