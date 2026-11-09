import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { PublicExcerptsPage } from '#layers/thei/shared/api/public';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import { resolveEntityViewer } from '../../../../thei/access-links/viewer';
import { buildPublicExcerptsPage } from '../../../../thei/public/excerpts';

/** One page of the excerpts about this entity, for the block that shows them. */
export default defineEventHandler(
  async (event): Promise<PublicExcerptsPage> => {
    const row = await THEI_SERVER.projects.findByPublicId(
      publicIdFromProjectUrlPart(getRouterParam(event, 'project') ?? ''),
    );
    if (!row) throw createError({ statusCode: 404 });
    const viewer = await resolveEntityViewer(event, 'project', row.projectUuid);
    if (row.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
      throw createError({ statusCode: 404 });
    return buildPublicExcerptsPage(
      { type: 'project', id: row.projectUuid },
      getQuery(event).page,
      viewer,
    );
  },
);
