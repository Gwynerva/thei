import type { DiaryEditData } from '#layers/thei/shared/diary';
import { createDiaryEntryFromForm } from '../../../thei/diary/create';

export default defineEventHandler(async (event) =>
  createDiaryEntryFromForm(await readBody<DiaryEditData>(event)),
);
