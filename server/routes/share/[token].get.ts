import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import {
  rememberShareToken,
  resolveShareToken,
} from '../../thei/access-links/share-links';
import { sitePath } from '../../thei/site-url';

/**
 * Opens a share link: remembers the token in a cookie and forwards to the
 * entity itself.
 *
 * The cookie is what makes the rest work — a page pulls in its own API calls
 * and its media as separate requests, and only a cookie rides along with all
 * of them. The address bar is left showing the ordinary URL of the project or
 * event, so the token is not copied along with the link to the page.
 */
export default defineEventHandler(async (event) => {
  const token = (getRouterParam(event, 'token') ?? '').replace(/\/$/, '');
  const link = resolveShareToken(token);
  if (!link) {
    setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    throw createError({
      statusCode: 404,
      message: THEI_SERVER.phrase.share_link_expired,
    });
  }

  let target: string | undefined;
  if (link.entityType === 'project') {
    const project = await THEI_SERVER.projects.findByUuid(link.entityUuid);
    if (project)
      target = buildProjectUrl(project.humanReadableSlug, project.publicId);
  } else {
    const stored = await THEI_SERVER.events.findByUuid(link.entityUuid);
    if (stored)
      target = buildEventUrl(stored.humanReadableSlug, stored.publicId);
  }
  if (!target) throw createError({ statusCode: 404 });

  rememberShareToken(event, token);
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
  setHeader(event, 'Cache-Control', 'private, no-store');
  return sendRedirect(event, sitePath(target), 302);
});
