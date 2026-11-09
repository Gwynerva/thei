import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicExcerptsPage } from '#layers/thei/shared/api/public';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { resolveEntityViewer } from '../../../../thei/access-links/viewer';
import { buildPublicExcerptsPage } from '../../../../thei/public/excerpts';

/** One page of the excerpts about this entity, for the block that shows them. */
export default defineEventHandler(
  async (event): Promise<PublicExcerptsPage> => {
    const part = getRouterParam(event, 'event') ?? '';
    const row =
      (await THEI_SERVER.events.findByUuid(part)) ??
      (await THEI_SERVER.events.findByPublicId(publicIdFromEventUrlPart(part)));
    if (!row) throw createError({ statusCode: 404 });
    const viewer = await resolveEntityViewer(event, 'event', row.eventUuid);
    if (row.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
      throw createError({ statusCode: 404 });
    return buildPublicExcerptsPage(
      { type: 'event', id: row.eventUuid },
      getQuery(event).page,
      viewer,
    );
  },
);
