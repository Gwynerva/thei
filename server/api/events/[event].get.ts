import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicEventResponseFull } from '#layers/thei/shared/api/public';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { buildPublicEvent } from '../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PublicEventResponseFull> => {
    const part = getRouterParam(event, 'event') ?? '';
    const stored =
      (await THEI_SERVER.events.findByUuid(part)) ??
      (await THEI_SERVER.events.findByPublicId(publicIdFromEventUrlPart(part)));
    if (!stored) throw createError({ statusCode: 404 });
    const isAdmin = await THEI_SERVER.isAdmin(event);
    if (stored.access === ProjectEventAccessLevel.Private && !isAdmin)
      throw createError({ statusCode: 404 });
    if (stored.access === ProjectEventAccessLevel.LinkOnly)
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    return buildPublicEvent(stored, isAdmin);
  },
);
