import { asc, eq } from 'drizzle-orm';
import type { ProjectExternalLinkSaveItem } from '#layers/thei/shared/external-link';
import { toExternalLink } from '../external-links/repository';

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
      accent: schema.externalLinks.accent,
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
