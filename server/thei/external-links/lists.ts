import { and, asc, eq } from 'drizzle-orm';
import type {
  ExternalLinkListInput,
  NamedExternalLink,
  NamedExternalLinkListInput,
  ProjectExternalLink,
} from '#layers/thei/shared/external-link';
import { toExternalLink } from './repository';

/**
 * Who a list of manual links belongs to. Projects, events and the profile
 * each keep theirs in a table of their own. All have the same shape, except
 * that the profile, which shows its links as chips, names each one.
 */
export type ExternalLinkListOwner =
  | { type: 'project'; id: string }
  | { type: 'event'; id: string }
  | { type: 'profile' };

type NamedListOwner = Extract<ExternalLinkListOwner, { type: 'profile' }>;
type UnnamedListOwner = Exclude<ExternalLinkListOwner, NamedListOwner>;

function listTable(schema: any, owner: ExternalLinkListOwner) {
  switch (owner.type) {
    case 'project':
      return {
        table: schema.projectExternalLinks,
        ownerColumns: { projectUuid: owner.id },
        filter: eq(schema.projectExternalLinks.projectUuid, owner.id),
        named: false,
      };
    case 'event':
      return {
        table: schema.eventExternalLinks,
        ownerColumns: { eventUuid: owner.id },
        filter: eq(schema.eventExternalLinks.eventUuid, owner.id),
        named: false,
      };
    case 'profile':
      return {
        table: schema.profileExternalLinks,
        ownerColumns: {},
        filter: undefined,
        named: true,
      };
  }
}

/**
 * Replaces the owner's list with `links`, in their order. An entry sent
 * without a note keeps the note it had (`ExternalLinkListInput`).
 */
export function applyExternalLinkList(
  tx: any,
  schema: any,
  owner: NamedListOwner,
  links: NamedExternalLinkListInput[] | undefined,
): void;
export function applyExternalLinkList(
  tx: any,
  schema: any,
  owner: UnnamedListOwner,
  links: ExternalLinkListInput[] | undefined,
): void;
export function applyExternalLinkList(
  tx: any,
  schema: any,
  owner: ExternalLinkListOwner,
  links: (ExternalLinkListInput & { name?: string })[] | undefined,
) {
  if (links === undefined) return;
  const { table, ownerColumns, filter, named } = listTable(schema, owner);
  const query = tx.select({ url: table.url, note: table.note }).from(table);
  const notes = new Map<string, string>(
    (filter ? query.where(filter) : query)
      .all()
      .map((row: { url: string; note: string }) => [row.url, row.note]),
  );
  deleteExternalLinkList(tx, schema, owner);
  links.forEach((link, sortOrder) => {
    tx.insert(table)
      .values({
        ...ownerColumns,
        url: link.url,
        ...(named ? { name: link.name } : {}),
        note: link.note ?? notes.get(link.url) ?? '',
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
  owner: NamedListOwner,
  options?: { includePrivate?: boolean },
): NamedExternalLink[];
export function getExternalLinkList(
  owner: UnnamedListOwner,
  options?: { includePrivate?: boolean },
): ProjectExternalLink[];
export function getExternalLinkList(
  owner: ExternalLinkListOwner,
  { includePrivate = true } = {},
): ProjectExternalLink[] {
  const { db, schema } = THEI_SERVER.useDb();
  const { table, filter, named } = listTable(schema, owner);
  const rows = db
    .select({
      ...(named ? { name: table.name } : {}),
      note: table.note,
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
    Parameters<typeof toExternalLink>[0] & {
      name?: string;
      note: string;
      isPrivate: boolean;
    }
  >;
  return rows.map(({ name, note, isPrivate, ...row }) => ({
    ...toExternalLink(row),
    ...(name === undefined ? {} : { name }),
    note,
    isPrivate,
  }));
}
