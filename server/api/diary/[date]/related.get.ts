import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicRelatedPage } from '#layers/thei/shared/api/public';
import { dateFromDiaryUrlPart } from '#layers/thei/shared/diary-url';
import { resolveEntityViewer } from '../../../thei/access-links/viewer';
import {
  buildPublicRelatedPage,
  readPublicRelatedQuery,
} from '../../../thei/public/related';

export default defineEventHandler(async (event): Promise<PublicRelatedPage> => {
  const date = dateFromDiaryUrlPart(getRouterParam(event, 'date') ?? '');
  if (!date) throw createError({ statusCode: 404 });
  const stored = await THEI_SERVER.diary.findByDate(date);
  if (!stored) throw createError({ statusCode: 404 });
  const viewer = await resolveEntityViewer(
    event,
    'diary-entry',
    stored.diaryUuid,
  );
  if (stored.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
    throw createError({ statusCode: 404 });
  const { kind, page } = readPublicRelatedQuery(event);
  return buildPublicRelatedPage(
    { type: 'diary-entry', id: stored.diaryUuid },
    kind,
    page,
    viewer.isAdmin,
  );
});
