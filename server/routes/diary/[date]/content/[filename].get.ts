import { dateFromDiaryUrlPart } from '#layers/thei/shared/diary-url';
import { sendContextAsset } from '../../../../thei/assets/context-access';

export default defineEventHandler(async (event) => {
  const date = dateFromDiaryUrlPart(getRouterParam(event, 'date') ?? '');
  if (!date) throw createError({ statusCode: 404 });
  const entry = await THEI_SERVER.diary.findByDate(date);
  if (!entry) throw createError({ statusCode: 404 });

  return sendContextAsset(event, {
    ownerType: 'diary-entry',
    ownerId: entry.diaryUuid,
    access: entry.access,
    role: 'content',
    filename: getRouterParam(event, 'filename') ?? '',
  });
});
