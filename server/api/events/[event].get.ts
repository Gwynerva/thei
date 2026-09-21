import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicEventResponseFull } from '#layers/thei/shared/api/public';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { buildPublicEvent } from '../../thei/public/entities';
import { resolveEntityViewer } from '../../thei/access-links/viewer';
import { markSharedResponse } from '../../thei/access-links/response';

export default defineEventHandler(
  async (event): Promise<PublicEventResponseFull> => {
    const part = getRouterParam(event, 'event') ?? '';
    const stored =
      (await THEI_SERVER.events.findByUuid(part)) ??
      (await THEI_SERVER.events.findByPublicId(publicIdFromEventUrlPart(part)));
    if (!stored) throw createError({ statusCode: 404 });
    const viewer = await resolveEntityViewer(event, 'event', stored.eventUuid);
    if (stored.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
      throw createError({ statusCode: 404 });
    if (stored.access === ProjectEventAccessLevel.LinkOnly || viewer.viaShare)
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    if (viewer.viaShare) markSharedResponse(event);
    return buildPublicEvent(stored, viewer.asOwner);
  },
);
