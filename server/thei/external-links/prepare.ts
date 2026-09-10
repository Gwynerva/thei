import { inArray } from 'drizzle-orm';
import type { ProjectExternalLinkSaveItem } from '#layers/thei/shared/external-link';
import { persistExternalLink } from './preview';

export async function prepareExternalLinks(
  links: ProjectExternalLinkSaveItem[] | undefined,
) {
  if (links === undefined) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const urls = links.map((link) => link.url);
  const existing = urls.length
    ? db
        .select({
          url: schema.externalLinks.url,
          touchedAt: schema.externalLinks.touchedAt,
        })
        .from(schema.externalLinks)
        .where(inArray(schema.externalLinks.url, urls))
        .all()
    : [];
  const existingTouchedAt = new Map(
    existing.map((row) => [row.url, row.touchedAt]),
  );
  await Promise.all(
    links
      .filter(
        (link) =>
          !existingTouchedAt.has(link.url) ||
          (link.touchedAt ?? 0) > (existingTouchedAt.get(link.url) ?? 0),
      )
      .map((link) => persistExternalLink(link.url)),
  );
  return links;
}
