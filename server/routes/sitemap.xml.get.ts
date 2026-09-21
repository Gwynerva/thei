import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import {
  buildSitemapEntries,
  sitemapEntryXml,
  type SitemapInput,
} from '../thei/public/sitemap';
import { siteRoot } from '../thei/site-url';

/**
 * Chunk size for streaming the document out.
 *
 * A resume site is not expected to reach tens of thousands of URLs, but the
 * body is assembled per chunk regardless so peak memory stays flat instead of
 * holding the whole document as one string.
 */
const CHUNK_SIZE = 500;

export default defineEventHandler(async (event) => {
  // The global middleware waves through any single-segment path with an
  // extension, so this route is reached before every access check. On a
  // private site a sitemap is the one thing that must not exist.
  if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }

  const { db, schema } = THEI_SERVER.useDb();
  const input: SitemapInput = {
    projects: db
      .select({
        projectUuid: schema.projects.projectUuid,
        access: schema.projects.access,
        humanReadableSlug: schema.projects.humanReadableSlug,
        publicId: schema.projects.publicId,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .all(),
    sections: db
      .select({
        projectUuid: schema.projectContentSections.projectUuid,
        humanReadableSlug: schema.projectContentSections.humanReadableSlug,
        publicId: schema.projectContentSections.publicId,
        isPrivate: schema.projectContentSections.isPrivate,
        updatedAt: schema.projectContentSections.updatedAt,
      })
      .from(schema.projectContentSections)
      .all(),
    stages: db
      .select({
        projectUuid: schema.projectStages.projectUuid,
        humanReadableSlug: schema.projectStages.humanReadableSlug,
        publicId: schema.projectStages.publicId,
        isPrivate: schema.projectStages.isPrivate,
        updatedAt: schema.projectStages.updatedAt,
      })
      .from(schema.projectStages)
      .all(),
    events: db
      .select({
        eventUuid: schema.events.eventUuid,
        access: schema.events.access,
        humanReadableSlug: schema.events.humanReadableSlug,
        publicId: schema.events.publicId,
        updatedAt: schema.events.updatedAt,
      })
      .from(schema.events)
      .all(),
    pages: db
      .select({
        slug: schema.pages.slug,
        access: schema.pages.access,
        updatedAt: schema.pages.updatedAt,
      })
      .from(schema.pages)
      .all(),
    tags: db
      .select({
        tagUuid: schema.tags.tagUuid,
        slug: schema.tags.slug,
        publicId: schema.tags.publicId,
      })
      .from(schema.tags)
      .all(),
    tagUsages: db
      .select({
        tagUuid: schema.tagUsages.tagUuid,
        containerType: schema.tagUsages.containerType,
        containerId: schema.tagUsages.containerId,
      })
      .from(schema.tagUsages)
      .all(),
    periods: db
      .select({
        stageType: schema.stagePeriods.stageType,
        stageUuid: schema.stagePeriods.stageUuid,
        startDate: schema.stagePeriods.startDate,
        endDate: schema.stagePeriods.endDate,
      })
      .from(schema.stagePeriods)
      .all(),
  };

  // Deliberately not `THEI_SERVER.isAdmin(event)`: an admin opening this URL,
  // or a proxy caching what they got, must not turn it into a list of every
  // private address on the site.
  const entries = buildSitemapEntries(input);
  // Includes the base path, so a site in a subfolder lists its own addresses.
  const origin = siteRoot(event);

  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8');
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          '<?xml version="1.0" encoding="UTF-8"?>' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ),
      );
      for (let index = 0; index < entries.length; index += CHUNK_SIZE) {
        controller.enqueue(
          encoder.encode(
            entries
              .slice(index, index + CHUNK_SIZE)
              .map((entry) => sitemapEntryXml(entry, origin))
              .join(''),
          ),
        );
      }
      controller.enqueue(encoder.encode('</urlset>'));
      controller.close();
    },
  });
});
