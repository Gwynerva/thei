import { max } from 'drizzle-orm';
import type { EntityKey, EntityKind } from '../../entity-kinds';
import { loadDocuments } from '../../mcp/documents';

/**
 * What in the archive was made or changed within a stretch of time: an
 * entity changes with its fields, and with any of its texts. It is how a
 * template's model learns what «since last time» holds, whatever its
 * request is about.
 */

/** The kinds a change is looked for in. */
export const CHANGE_KINDS: EntityKind[] = [
  'project',
  'project-section',
  'event',
  'diary-entry',
  'page',
  'tag',
];

export interface ArchiveChange {
  ref: string;
  key: EntityKey;
  kind: EntityKind;
  title: string;
  /** A diary entry's day. */
  date?: string;
  changedAt: number;
}

/** When each entity's texts last changed, by `kind:id`. */
function textsChangedAt(): Map<string, number> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      type: schema.content.ownerType,
      id: schema.content.ownerId,
      at: max(schema.content.updatedAt),
    })
    .from(schema.content)
    .groupBy(schema.content.ownerType, schema.content.ownerId)
    .all() as { type: string; id: string; at: number | null }[];
  return new Map(rows.map((row) => [`${row.type}:${row.id}`, row.at ?? 0]));
}

/** What changed from `from` to `to`, the latest first. */
export function changesBetween(range: {
  from: number;
  to?: number;
  kinds?: EntityKind[];
}): ArchiveChange[] {
  const texts = textsChangedAt();
  const to = range.to ?? Number.POSITIVE_INFINITY;
  return loadDocuments(range.kinds ?? CHANGE_KINDS)
    .flatMap((document) => {
      const changedAt = Math.max(
        document.updatedAt,
        texts.get(`${document.kind}:${document.id}`) ?? 0,
      );
      if (changedAt < range.from || changedAt > to) return [];
      const key: EntityKey = {
        kind: document.kind,
        id: document.id,
        ...(document.date ? { date: document.date } : {}),
      };
      return [
        {
          ref: document.ref,
          key,
          kind: document.kind,
          title: document.title,
          ...(document.date ? { date: document.date } : {}),
          changedAt,
        },
      ];
    })
    .sort((left, right) => right.changedAt - left.changedAt);
}
