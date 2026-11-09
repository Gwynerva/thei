import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicExcerptResponse } from '#layers/thei/shared/api/public';
import { publicIdFromExcerptUrlPart } from '#layers/thei/shared/excerpt-url';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import { resolveEntityViewer } from '../../../../thei/access-links/viewer';
import { projectExcerptParent } from '../../../../thei/excerpts/parents';
import {
  buildExcerptNeighbours,
  buildPublicExcerpt,
  visibleParentExcerpts,
} from '../../../../thei/public/excerpts';

/**
 * An excerpt's own page. Its parent's share link covers it, as a project's
 * covers its sections; a private excerpt is the private side's alone.
 */
export default defineEventHandler(
  async (event): Promise<PublicExcerptResponse> => {
    const row = await THEI_SERVER.projects.findByPublicId(
      publicIdFromProjectUrlPart(getRouterParam(event, 'project') ?? ''),
    );
    if (!row) throw createError({ statusCode: 404 });
    const parent = projectExcerptParent(row);
    const viewer = await resolveEntityViewer(event, parent.type, parent.id);
    if (parent.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
      throw createError({ statusCode: 404 });
    const publicId = publicIdFromExcerptUrlPart(
      getRouterParam(event, 'excerpt') ?? '',
    );
    const visible = visibleParentExcerpts(parent, viewer);
    const excerpt = visible.find((item) => item.publicId === publicId);
    if (!excerpt) throw createError({ statusCode: 404 });
    if (parent.access === ProjectEventAccessLevel.LinkOnly)
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    const [response, neighbours] = await Promise.all([
      buildPublicExcerpt(excerpt, parent, viewer, {
        number: visible.indexOf(excerpt) + 1,
        count: visible.length,
      }),
      buildExcerptNeighbours(visible, excerpt, parent, viewer),
    ]);
    return { ...response, neighbours };
  },
);
