import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicExcerptsPage } from '#layers/thei/shared/api/public';
import { dateFromDiaryUrlPart } from '#layers/thei/shared/diary-url';
import { resolveEntityViewer } from '../../../../thei/access-links/viewer';
import { buildPublicExcerptsPage } from '../../../../thei/public/excerpts';

/** One page of the excerpts about this entity, for the block that shows them. */
export default defineEventHandler(
  async (event): Promise<PublicExcerptsPage> => {
    const date = dateFromDiaryUrlPart(getRouterParam(event, 'date') ?? '');
    if (!date) throw createError({ statusCode: 404 });
    const row = await THEI_SERVER.diary.findByDate(date);
    if (!row) throw createError({ statusCode: 404 });
    const viewer = await resolveEntityViewer(
      event,
      'diary-entry',
      row.diaryUuid,
    );
    if (row.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
      throw createError({ statusCode: 404 });
    return buildPublicExcerptsPage(
      { type: 'diary-entry', id: row.diaryUuid },
      getQuery(event).page,
      viewer,
    );
  },
);
