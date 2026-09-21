import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicPageResponse } from '#layers/thei/shared/api/page';
import { buildPublicPage } from '../../thei/public/entities';
import { resolveEntityViewer } from '../../thei/access-links/viewer';
import { markSharedResponse } from '../../thei/access-links/response';

export default defineEventHandler(
  async (event): Promise<PublicPageResponse> => {
    const slug = getRouterParam(event, 'slug') ?? '';
    const page = await THEI_SERVER.pages.findBySlug(slug);
    if (!page) throw createError({ statusCode: 404 });
    const viewer = await resolveEntityViewer(event, 'page', page.pageUuid);
    if (page.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
      throw createError({ statusCode: 404 });
    if (page.access === ProjectEventAccessLevel.LinkOnly || viewer.viaShare)
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    if (viewer.viaShare) markSharedResponse(event);
    // The private view a share link grants covers this page and nothing else:
    // the owner's own notes and reminder stay with the owner.
    return buildPublicPage(page, viewer.isAdmin, viewer.asOwner);
  },
);
