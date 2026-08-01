import { asc, eq, inArray } from 'drizzle-orm';
import type { ProjectExternalLinkSaveItem } from '#layers/thei/shared/external-link';
import { toExternalLink } from '../external-links/repository';
import { persistExternalLink } from '../external-links/preview';

export async function prepareProjectExternalLinks(
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
  const stale = links.filter(
    (link) =>
      !existingTouchedAt.has(link.url) ||
      (link.touchedAt ?? 0) > (existingTouchedAt.get(link.url) ?? 0),
  );
  await Promise.all(stale.map((link) => persistExternalLink(link.url)));
  return links;
}

export function applyProjectExternalLinks(
  tx: any,
  schema: any,
  projectUuid: string,
  links: ProjectExternalLinkSaveItem[] | undefined,
) {
  if (links === undefined) return;
  tx.delete(schema.projectExternalLinks)
    .where(eq(schema.projectExternalLinks.projectUuid, projectUuid))
    .run();
  links.forEach((link, sortOrder) => {
    tx.insert(schema.projectExternalLinks)
      .values({
        projectUuid,
        url: link.url,
        name: link.name,
        sortOrder,
        isPrivate: link.isPrivate,
      })
      .run();
  });
}

export function deleteProjectExternalLinks(
  tx: any,
  schema: any,
  projectUuid: string,
) {
  tx.delete(schema.projectExternalLinks)
    .where(eq(schema.projectExternalLinks.projectUuid, projectUuid))
    .run();
}

export async function getProjectExternalLinks(projectUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      name: schema.projectExternalLinks.name,
      isPrivate: schema.projectExternalLinks.isPrivate,
      url: schema.externalLinks.url,
      title: schema.externalLinks.title,
      description: schema.externalLinks.description,
      faviconKey: schema.externalLinks.faviconKey,
      accentHue: schema.externalLinks.accentHue,
      touchedAt: schema.externalLinks.touchedAt,
    })
    .from(schema.projectExternalLinks)
    .innerJoin(
      schema.externalLinks,
      eq(schema.projectExternalLinks.url, schema.externalLinks.url),
    )
    .where(eq(schema.projectExternalLinks.projectUuid, projectUuid))
    .orderBy(asc(schema.projectExternalLinks.sortOrder))
    .all();
  return rows.map((row) => ({
    ...toExternalLink(row),
    name: row.name,
    isPrivate: row.isPrivate,
  }));
}
