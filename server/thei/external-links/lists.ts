import { and, asc, eq } from 'drizzle-orm';
import type {
  ExternalLinkListItem,
  ProjectExternalLink,
} from '#layers/thei/shared/external-link';
import { toExternalLink } from './repository';

/**
 * Who a list of manual links belongs to. Projects, events and the profile
 * each keep theirs in a table of their own, all of the same shape.
 */
export type ExternalLinkListOwner =
  | { type: 'project'; id: string }
  | { type: 'event'; id: string }
  | { type: 'profile' };

function listTable(schema: any, owner: ExternalLinkListOwner) {
  switch (owner.type) {
    case 'project':
      return {
        table: schema.projectExternalLinks,
        ownerColumns: { projectUuid: owner.id },
        filter: eq(schema.projectExternalLinks.projectUuid, owner.id),
      };
    case 'event':
      return {
        table: schema.eventExternalLinks,
        ownerColumns: { eventUuid: owner.id },
        filter: eq(schema.eventExternalLinks.eventUuid, owner.id),
      };
    case 'profile':
      return {
        table: schema.profileExternalLinks,
        ownerColumns: {},
        filter: undefined,
      };
  }
}

/** Replaces the owner's list with `links`, in their order. */
export function applyExternalLinkList(
  tx: any,
  schema: any,
  owner: ExternalLinkListOwner,
  links: ExternalLinkListItem[] | undefined,
) {
  if (links === undefined) return;
  deleteExternalLinkList(tx, schema, owner);
  const { table, ownerColumns } = listTable(schema, owner);
  links.forEach((link, sortOrder) => {
    tx.insert(table)
      .values({
        ...ownerColumns,
        url: link.url,
        name: link.name,
        sortOrder,
        isPrivate: link.isPrivate,
      })
      .run();
  });
}

export function deleteExternalLinkList(
  tx: any,
  schema: any,
  owner: ExternalLinkListOwner,
) {
  const { table, filter } = listTable(schema, owner);
  const query = tx.delete(table);
  (filter ? query.where(filter) : query).run();
}

/** The owner's links with their stored details, in display order. */
export function getExternalLinkList(
  owner: ExternalLinkListOwner,
  { includePrivate = true } = {},
): ProjectExternalLink[] {
  const { db, schema } = THEI_SERVER.useDb();
  const { table, filter } = listTable(schema, owner);
  const rows = db
    .select({
      name: table.name,
      isPrivate: table.isPrivate,
      url: schema.externalLinks.url,
      title: schema.externalLinks.title,
      description: schema.externalLinks.description,
      faviconKey: schema.externalLinks.faviconKey,
      accent: schema.externalLinks.accent,
      status: schema.externalLinks.status,
      touchedAt: schema.externalLinks.touchedAt,
    })
    .from(table)
    .innerJoin(schema.externalLinks, eq(table.url, schema.externalLinks.url))
    .where(and(filter, includePrivate ? undefined : eq(table.isPrivate, false)))
    .orderBy(asc(table.sortOrder))
    .all() as Array<
    Parameters<typeof toExternalLink>[0] & { name: string; isPrivate: boolean }
  >;
  return rows.map((row) => ({
    ...toExternalLink(row),
    name: row.name,
    isPrivate: row.isPrivate,
  }));
}
