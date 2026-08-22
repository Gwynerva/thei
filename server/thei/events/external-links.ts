import { asc, eq, inArray } from 'drizzle-orm';
import type { ProjectExternalLinkSaveItem } from '#layers/thei/shared/external-link';
import { toExternalLink } from '../external-links/repository';
import { persistExternalLink } from '../external-links/preview';

export async function prepareEventExternalLinks(
  links: ProjectExternalLinkSaveItem[] | undefined,
) {
  if (links === undefined) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const urls = links.map((link) => link.url);
  const existing = urls.length
    ? db
        .select({ url: schema.externalLinks.url })
        .from(schema.externalLinks)
        .where(inArray(schema.externalLinks.url, urls))
        .all()
    : [];
  const known = new Set(existing.map((row) => row.url));
  await Promise.all(
    links
      .filter((link) => !known.has(link.url))
      .map((link) => persistExternalLink(link.url)),
  );
  return links;
}

export function applyEventExternalLinks(
  tx: any,
  schema: any,
  eventUuid: string,
  links: ProjectExternalLinkSaveItem[] | undefined,
) {
  if (links === undefined) return;
  tx.delete(schema.eventExternalLinks)
    .where(eq(schema.eventExternalLinks.eventUuid, eventUuid))
    .run();
  links.forEach((link, sortOrder) => {
    tx.insert(schema.eventExternalLinks)
      .values({
        eventUuid,
        url: link.url,
        name: link.name,
        sortOrder,
        isPrivate: link.isPrivate,
      })
      .run();
  });
}

export async function getEventExternalLinks(eventUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      name: schema.eventExternalLinks.name,
      isPrivate: schema.eventExternalLinks.isPrivate,
      url: schema.externalLinks.url,
      title: schema.externalLinks.title,
      description: schema.externalLinks.description,
      faviconKey: schema.externalLinks.faviconKey,
      accentHue: schema.externalLinks.accentHue,
      touchedAt: schema.externalLinks.touchedAt,
    })
    .from(schema.eventExternalLinks)
    .innerJoin(
      schema.externalLinks,
      eq(schema.eventExternalLinks.url, schema.externalLinks.url),
    )
    .where(eq(schema.eventExternalLinks.eventUuid, eventUuid))
    .orderBy(asc(schema.eventExternalLinks.sortOrder))
    .all();
  return rows.map((row) => ({
    ...toExternalLink(row),
    name: row.name,
    isPrivate: row.isPrivate,
  }));
}
