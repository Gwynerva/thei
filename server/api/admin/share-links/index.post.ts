import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import {
  isShareLinkDuration,
  isShareLinkEntityType,
  type ShareLinkItem,
} from '#layers/thei/shared/share-link';
import {
  createShareLink,
  findShareTarget,
  toShareLinkItem,
} from '../../../thei/access-links/share-links';

export default defineEventHandler(async (event): Promise<ShareLinkItem> => {
  // A closed site answers every visitor with a 403 before any of this, so a
  // share link there would only look like it worked.
  if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private)
    throw createError({
      statusCode: 409,
      message: THEI_SERVER.phrase.share_link_private_site,
    });
  const body = await readBody<{
    entityType?: unknown;
    entityUuid?: unknown;
    duration?: unknown;
    label?: unknown;
  }>(event);
  if (
    !isShareLinkEntityType(body?.entityType) ||
    typeof body.entityUuid !== 'string' ||
    !body.entityUuid ||
    !isShareLinkDuration(body.duration)
  )
    throw createError({ statusCode: 400, message: 'Invalid share link' });
  if (!(await findShareTarget(body.entityType, body.entityUuid)))
    throw createError({ statusCode: 404 });
  const link = await createShareLink(
    body.entityType,
    body.entityUuid,
    body.duration,
    typeof body.label === 'string' ? body.label : '',
  );
  return toShareLinkItem(event, link);
});
