import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicRelatedPage } from '#layers/thei/shared/api/public';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { resolveEntityViewer } from '../../../thei/access-links/viewer';
import {
  buildPublicRelatedPage,
  readPublicRelatedQuery,
} from '../../../thei/public/related';

export default defineEventHandler(async (event): Promise<PublicRelatedPage> => {
  const part = getRouterParam(event, 'event') ?? '';
  const stored =
    (await THEI_SERVER.events.findByUuid(part)) ??
    (await THEI_SERVER.events.findByPublicId(publicIdFromEventUrlPart(part)));
  if (!stored) throw createError({ statusCode: 404 });
  const viewer = await resolveEntityViewer(event, 'event', stored.eventUuid);
  if (stored.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
    throw createError({ statusCode: 404 });
  const { kind, page } = readPublicRelatedQuery(event);
  return buildPublicRelatedPage(
    { type: 'event', id: stored.eventUuid },
    kind,
    page,
    viewer.isAdmin,
  );
});
