import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicPageResponse } from '#layers/thei/shared/api/page';
import {
  buildPublicPage,
  canOpenPublicEntity,
} from '../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PublicPageResponse> => {
    const slug = getRouterParam(event, 'slug') ?? '';
    const page = await THEI_SERVER.pages.findBySlug(slug);
    if (!page) throw createError({ statusCode: 404 });
    const isAdmin = await THEI_SERVER.isAdmin(event);
    if (!canOpenPublicEntity(page.access, isAdmin))
      throw createError({ statusCode: 404 });
    if (page.access === ProjectEventAccessLevel.LinkOnly)
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    return buildPublicPage(page, isAdmin);
  },
);
