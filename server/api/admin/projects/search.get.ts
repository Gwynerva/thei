import type { ProjectSearchItem } from '#layers/thei/shared/api/project';
import { rankProjectSearch } from '#layers/thei/shared/admin/project-search';
import { buildAdminAssetUrls } from '../../../thei/assets/urls';
import { resolveGeneratedIcon } from '../../../thei/media/generated-icon';
import { listTagsForContainer } from '../../../thei/tags';

export default defineEventHandler(
  async (event): Promise<ProjectSearchItem[]> => {
    const query = getQuery(event);
    const search = typeof query.query === 'string' ? query.query : '';
    const excluded = new Set(
      (typeof query.excludeProjectUuids === 'string'
        ? query.excludeProjectUuids.split(',')
        : []
      ).filter(Boolean),
    );
    const { db, schema } = THEI_SERVER.useDb();
    const projects = db
      .select()
      .from(schema.projects)
      .all()
      .filter((project) => !excluded.has(project.projectUuid));
    const matches = rankProjectSearch(projects, search);

    return await Promise.all(
      matches.map(async (project) => {
        const iconUsage = (
          await THEI_SERVER.assets.usages.findByContainer(
            'project',
            project.projectUuid,
          )
        ).find((usage) => usage.role === 'icon');
        return {
          projectUuid: project.projectUuid,
          title: project.title,
          humanReadableSlug: project.humanReadableSlug,
          publicId: project.publicId,
          iconMedia: iconUsage
            ? (await buildAdminAssetUrls(iconUsage.asset)).media!
            : resolveGeneratedIcon('project', project.projectUuid),
          tags: (await listTagsForContainer('project', project.projectUuid)).slice(0, 3),
        };
      }),
    );
  },
);
