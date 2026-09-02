import { buildContentPreview } from '#layers/thei/shared/content';
import {
  rankContentEntities,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import { buildAdminAssetUrls } from '../../thei/assets/urls';
import { resolveEntityIconMedia } from '../../thei/media/generated-icon';
import { listTagsForContainer } from '../../thei/tags';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';

export default defineEventHandler(
  async (event): Promise<ContentEntitySearchItem[]> => {
    const query = getQuery(event);
    const allowed = new Set(
      (typeof query.entityTypes === 'string'
        ? query.entityTypes.split(',')
        : ['project', 'event', 'page']
      ).filter(
        (value) => value === 'project' || value === 'event' || value === 'page',
      ),
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
          previewMedia: resolveEntityIconMedia(
            'project',
            project.projectUuid,
            icon ? (await buildAdminAssetUrls(icon.asset)).media! : undefined,
          ),
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
    if (allowed.has('page')) {
      for (const page of db.select().from(schema.pages).all()) {
        if (excluded.has(`page:${page.pageUuid}`)) continue;
        const icon = (
          await THEI_SERVER.assets.usages.findByContainer('page', page.pageUuid)
        ).find((usage) => usage.role === 'icon');
        items.push({
          entityType: 'page',
          entityId: page.pageUuid,
          title: page.title,
          summary: page.summary,
          url: buildPageUrl(page.slug),
          humanReadableSlug: page.slug,
          updatedAt: page.updatedAt,
          previewMedia: resolveEntityIconMedia(
            'page',
            page.pageUuid,
            icon ? (await buildAdminAssetUrls(icon.asset)).media! : undefined,
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
