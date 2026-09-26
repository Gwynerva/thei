import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicPageResponse } from '#layers/thei/shared/api/page';
import { buildPublicPage } from '../../thei/public/entities';
import { resolveEntityViewer } from '../../thei/access-links/viewer';

export default defineEventHandler(
  async (event): Promise<PublicPageResponse> => {
    const slug = getRouterParam(event, 'slug') ?? '';
    const page = await THEI_SERVER.pages.findBySlug(slug);
    if (!page) throw createError({ statusCode: 404 });
    const viewer = await resolveEntityViewer(event, 'page', page.pageUuid);
    if (page.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
      throw createError({ statusCode: 404 });
    if (page.access === ProjectEventAccessLevel.LinkOnly)
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    return buildPublicPage(page, viewer);
  },
);
