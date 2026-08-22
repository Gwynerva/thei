import { buildContentPreview } from '#layers/thei/shared/content';
import {
  rankContentEntities,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import { buildAdminAssetUrls } from '../../thei/assets/urls';
import { resolveGeneratedIcon } from '../../thei/media/generated-icon';
import { listTagsForContainer } from '../../thei/tags';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';

export default defineEventHandler(
  async (event): Promise<ContentEntitySearchItem[]> => {
    const query = getQuery(event);
    const allowed = new Set(
      (typeof query.entityTypes === 'string'
        ? query.entityTypes.split(',')
        : ['project', 'event']
      ).filter((value) => value === 'project' || value === 'event'),
    );
    const excluded = new Set(
      typeof query.exclude === 'string' ? query.exclude.split(',') : [],
    );
    const { db, schema } = THEI_SERVER.useDb();
    const items: ContentEntitySearchItem[] = [];
    if (allowed.has('project')) {
      for (const project of db.select().from(schema.projects).all()) {
        if (excluded.has(`project:${project.projectUuid}`)) continue;
        const icon = (
          await THEI_SERVER.assets.usages.findByContainer(
            'project',
            project.projectUuid,
          )
        ).find((usage) => usage.role === 'icon');
        items.push({
          entityType: 'project',
          entityId: project.projectUuid,
          title: project.title,
          summary: project.summary,
          url: buildProjectUrl(project.humanReadableSlug, project.publicId),
          humanReadableSlug: project.humanReadableSlug,
          publicId: project.publicId,
          updatedAt: project.updatedAt,
          previewMedia: icon
            ? (await buildAdminAssetUrls(icon.asset)).media!
            : resolveGeneratedIcon('project', project.projectUuid),
          tags: (
            await listTagsForContainer('project', project.projectUuid)
          ).slice(0, 3),
        });
      }
    }
    if (allowed.has('event')) {
      for (const item of db.select().from(schema.events).all()) {
        if (excluded.has(`event:${item.eventUuid}`)) continue;
        const content = await THEI_SERVER.content.buildFieldValue(
          'event',
          item.eventUuid,
          'event-body',
        );
        items.push({
          entityType: 'event',
          entityId: item.eventUuid,
          title: item.title,
          summary: item.summary,
          url: buildEventUrl(item.humanReadableSlug, item.publicId),
          humanReadableSlug: item.humanReadableSlug,
          publicId: item.publicId,
          updatedAt: item.updatedAt,
          previewMedia: buildContentPreview(content?.data).media,
          tags: (await listTagsForContainer('event', item.eventUuid)).slice(
            0,
            3,
          ),
        });
      }
    }
    return rankContentEntities(
      items,
      typeof query.query === 'string' ? query.query : '',
    );
  },
);
