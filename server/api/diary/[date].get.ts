import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicDiaryResponse } from '#layers/thei/shared/api/public';
import { dateFromDiaryUrlPart } from '#layers/thei/shared/diary-url';
import { buildPublicDiaryEntry } from '../../thei/public/entities';
import { buildDiaryEntryNeighbours } from '../../thei/public/neighbours';
import { resolveEntityViewer } from '../../thei/access-links/viewer';
import { markSharedResponse } from '../../thei/access-links/response';

export default defineEventHandler(
  async (event): Promise<PublicDiaryResponse> => {
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
    if (stored.access === ProjectEventAccessLevel.LinkOnly || viewer.viaShare)
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    if (viewer.viaShare) markSharedResponse(event);
    const [response, neighbours] = await Promise.all([
      buildPublicDiaryEntry(stored, viewer.isAdmin, viewer.asOwner),
      buildDiaryEntryNeighbours(stored.date, viewer.isAdmin),
    ]);
    return { ...response, neighbours };
  },
);
