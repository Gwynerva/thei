import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import {
  isShareLinkDuration,
  isShareLinkEntityType,
  type ShareLinkItem,
} from '#layers/thei/shared/share-link';
import {
  createShareLink,
  shareLinkPath,
} from '../../../thei/access-links/share-links';
import { siteUrl } from '../../../thei/site-url';

export default defineEventHandler(async (event): Promise<ShareLinkItem> => {
  // A closed site answers every visitor with a 403 before any of this, so a
  // share link there would only look like it worked.
  if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private)
    throw createError({
      statusCode: 409,
      message: THEI_SERVER.phrase.share_link_private_site,
    });
  const body = await readBody<{
    entityType?: string;
    entityUuid?: string;
    duration?: string;
  }>(event);
  const entityType = isShareLinkEntityType(body?.entityType)
    ? body.entityType
    : 'project';
  const entityUuid = String(body?.entityUuid ?? '');
  if (!entityUuid || !isShareLinkDuration(body?.duration))
    throw createError({ statusCode: 400, message: 'Invalid share link' });
  const exists =
    entityType === 'project'
      ? await THEI_SERVER.projects.findByUuid(entityUuid)
      : entityType === 'event'
        ? await THEI_SERVER.events.findByUuid(entityUuid)
        : entityType === 'diary-entry'
          ? await THEI_SERVER.diary.findByUuid(entityUuid)
          : await THEI_SERVER.pages.findByUuid(entityUuid);
  if (!exists) throw createError({ statusCode: 404 });
  const link = await createShareLink(entityType, entityUuid, body.duration);
  return { ...link, url: siteUrl(event, shareLinkPath(link.token!)) };
});
