import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicEventResponse } from '#layers/thei/shared/api/event';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { getEventPeriods } from '../../thei/events/periods';

export default defineEventHandler(
  async (event): Promise<PublicEventResponse> => {
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
    return {
      title: stored.title,
      summary: stored.summary,
      access: stored.access,
      humanReadableSlug: stored.humanReadableSlug,
      publicId: stored.publicId,
      periods: getEventPeriods(stored.eventUuid),
    };
  },
);
