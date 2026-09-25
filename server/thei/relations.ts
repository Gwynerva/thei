import { and, eq, inArray, or } from 'drizzle-orm';
import {
  relationEndpointKey,
  relationEndpointsEqual,
  type RelationEditItem,
  type RelationEndpoint,
  type RelationEntityType,
  type RelationGetItem,
  type RelationNote,
  type RelationType,
} from '#layers/thei/shared/relation';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type {
  StoredRelationNote,
  StoredRelationType,
} from './db/schema/entity-relations';
import { buildContentPreview } from '#layers/thei/shared/content';
import { buildAdminAssetUrls } from './assets/urls';
import { resolveEntityIconMedia } from './media/generated-icon';

/**
 * The picture that stands for a related entity in a list.
 *
 * A project has an icon, or a generated one derived from its identity. An
 * event and a diary entry borrow whatever their body opens with, exactly as
 * their own cards do, and a drawn icon of their kind when it opens with none.
 *
 * Admin addresses: this is for the relations editor. Public pages build their
 * pictures through `findContentEntity`, with the visitor's view.
 */
async function relationIconMedia(endpoint: RelationEndpoint) {
  if (endpoint.type === 'project') {
    const icon = (
      await THEI_SERVER.assets.usages.findByContainer('project', endpoint.id)
    ).find((usage) => usage.role === 'icon');
    return resolveEntityIconMedia(
      'project',
      endpoint.id,
      icon ? (await buildAdminAssetUrls(icon.asset)).media! : undefined,
    );
  }
  const [ownerType, slot] =
    endpoint.type === 'event'
      ? (['event', 'event-body'] as const)
      : (['diary-entry', 'diary-body'] as const);
  const content = await THEI_SERVER.content.buildFieldValue(
    ownerType,
    endpoint.id,
    slot,
  );
  return resolveEntityIconMedia(
    ownerType,
    endpoint.id,
    buildContentPreview(content?.data).media,
  );
}

/** The primary key of a row: its two ends, in canonical order. */
type RelationRowKey = {
  firstType: RelationEntityType;
  firstId: string;
  secondType: RelationEntityType;
  secondId: string;
};

type PreparedRelation = RelationEditItem & {
  row: RelationRowKey;
  storedType: StoredRelationType;
  storedNote?: StoredRelationNote;
};

/**
 * How a pair is written down, and whether `a` is the row's first end.
 *
 * A relation is one row, not two, so both ends have to agree on which of them
 * is written first: the smaller `type:id` key is. Plain code-unit order, the
 * same comparison the migration that created the table made.
 */
export function canonicalPair(
  a: RelationEndpoint,
  b: RelationEndpoint,
): [RelationRowKey, boolean] {
  const aIsFirst = relationEndpointKey(a) < relationEndpointKey(b);
  const [first, second] = aIsFirst ? [a, b] : [b, a];
  return [
    {
      firstType: first.type,
      firstId: first.id,
      secondType: second.type,
      secondId: second.id,
    },
    aIsFirst,
  ];
}

function rowKeyString(key: RelationRowKey) {
  return `${key.firstType}:${key.firstId}|${key.secondType}:${key.secondId}`;
}

function rowEndpoints(row: any): [RelationEndpoint, RelationEndpoint] {
  return [
    { type: row.firstType, id: row.firstId },
    { type: row.secondType, id: row.secondId },
  ];
}

/** Whether the owner is the row's first end, rather than its second. */
function ownerIsFirst(row: any, owner: RelationEndpoint) {
  return row.firstType === owner.type && row.firstId === owner.id;
}

function rowMatches(schema: any, owner: RelationEndpoint) {
  return or(
    and(
      eq(schema.entityRelations.firstType, owner.type),
      eq(schema.entityRelations.firstId, owner.id),
    ),
    and(
      eq(schema.entityRelations.secondType, owner.type),
      eq(schema.entityRelations.secondId, owner.id),
    ),
  );
}

function rowWhere(schema: any, key: RelationRowKey) {
  return and(
    eq(schema.entityRelations.firstType, key.firstType),
    eq(schema.entityRelations.firstId, key.firstId),
    eq(schema.entityRelations.secondType, key.secondType),
    eq(schema.entityRelations.secondId, key.secondId),
  );
}

/**
 * The other end of a relation, described the way a list needs it.
 *
 * A diary entry has no title, slug or public ID, so its day stands in for all
 * three: it is what the entry is called, what its address is built from, and
 * what identifies it.
 */
export type RelationTarget = {
  type: RelationEntityType;
  id: string;
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  date?: string;
  access: ProjectEventAccessLevel;
};

/** SQLite takes a bounded number of parameters per statement. */
const LOOKUP_CHUNK = 500;

function chunks<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += LOOKUP_CHUNK)
    result.push(items.slice(index, index + LOOKUP_CHUNK));
  return result;
}

/**
 * The entities behind a set of endpoints, one query per kind.
 *
 * A project may gather hundreds of diary entries, and looking each one up on
 * its own would cost a query per row on every page view. An endpoint whose
 * entity no longer exists is simply absent from the result.
 */
export async function loadRelationTargets(
  endpoints: RelationEndpoint[],
): Promise<Map<string, RelationTarget>> {
  const { db, schema } = THEI_SERVER.useDb();
  const targets = new Map<string, RelationTarget>();
  const set = (target: RelationTarget) =>
    targets.set(relationEndpointKey(target), target);
  const idsOf = (type: RelationEntityType) => [
    ...new Set(
      endpoints.filter((item) => item.type === type).map((item) => item.id),
    ),
  ];

  for (const ids of chunks(idsOf('project')))
    for (const project of db
      .select()
      .from(schema.projects)
      .where(inArray(schema.projects.projectUuid, ids))
      .all())
      set({
        type: 'project',
        id: project.projectUuid,
        title: project.title,
        summary: project.summary,
        humanReadableSlug: project.humanReadableSlug,
        publicId: project.publicId,
        access: project.access,
      });

  for (const ids of chunks(idsOf('event')))
    for (const event of db
      .select()
      .from(schema.events)
      .where(inArray(schema.events.eventUuid, ids))
      .all())
      set({
        type: 'event',
        id: event.eventUuid,
        title: event.title,
        summary: event.summary,
        humanReadableSlug: event.humanReadableSlug,
        publicId: event.publicId,
        access: event.access,
      });

  for (const ids of chunks(idsOf('diary-entry')))
    for (const entry of db
      .select()
      .from(schema.diaryEntries)
      .where(inArray(schema.diaryEntries.diaryUuid, ids))
      .all())
      set({
        type: 'diary-entry',
        id: entry.diaryUuid,
        title: entry.date,
        summary: '',
        humanReadableSlug: '',
        publicId: '',
        date: entry.date,
        access: entry.access,
      });

  return targets;
}

/**
 * Checks and translates the relation list an entity is saved with.
 *
 * Any of the three kinds edits its relations; the other end of each reads the
 * same row from its side.
 */
export async function prepareRelations(
  owner: RelationEndpoint,
  relations: RelationEditItem[] | undefined,
): Promise<PreparedRelation[] | undefined> {
  if (relations === undefined) return undefined;

  const targets = await loadRelationTargets(
    relations.map((relation) => ({
      type: relation.entityType,
      id: relation.entityId,
    })),
  );
  for (const relation of relations) {
    const target: RelationEndpoint = {
      type: relation.entityType,
      id: relation.entityId,
    };
    if (relationEndpointsEqual(target, owner))
      throw new Error('An entity cannot be related to itself');
    if (!targets.has(relationEndpointKey(target)))
      throw new Error('Related entity not found');
  }

  return relations.map((relation) => {
    const [row, ownerFirst] = canonicalPair(owner, {
      type: relation.entityType,
      id: relation.entityId,
    });
    return {
      ...relation,
      row,
      storedType: toStoredRelationType(relation.type, ownerFirst),
      storedNote: toStoredRelationNote(relation.note, ownerFirst),
    };
  });
}

export function applyRelations(
  tx: any,
  schema: any,
  owner: RelationEndpoint,
  relations: PreparedRelation[] | undefined,
) {
  if (relations === undefined) return;
  const existing = tx
    .select()
    .from(schema.entityRelations)
    .where(rowMatches(schema, owner))
    .all();
  const nextRows = new Set(relations.map((item) => rowKeyString(item.row)));

  for (const row of existing) {
    if (nextRows.has(rowKeyString(row))) continue;
    tx.delete(schema.entityRelations).where(rowWhere(schema, row)).run();
  }

  for (let index = 0; index < relations.length; index++) {
    const relation = relations[index]!;
    const ownerFirst = ownerIsFirst(relation.row, owner);
    const previous = existing.find(
      (row: any) => rowKeyString(row) === rowKeyString(relation.row),
    );
    const other: RelationEndpoint = ownerFirst
      ? { type: relation.row.secondType, id: relation.row.secondId }
      : { type: relation.row.firstType, id: relation.row.firstId };
    // The other entity's ordering is its own business: an existing row keeps
    // the position it had there, and a new one lands at the end of its list.
    const otherSortOrder =
      previous === undefined
        ? nextRelationOrder(tx, schema, other)
        : ownerFirst
          ? previous.secondSortOrder
          : previous.firstSortOrder;

    tx.insert(schema.entityRelations)
      .values({
        ...relation.row,
        type: relation.storedType,
        note: relation.storedNote ?? null,
        firstSortOrder: ownerFirst ? index : otherSortOrder,
        secondSortOrder: ownerFirst ? otherSortOrder : index,
      })
      .onConflictDoUpdate({
        target: [
          schema.entityRelations.firstType,
          schema.entityRelations.firstId,
          schema.entityRelations.secondType,
          schema.entityRelations.secondId,
        ],
        set: {
          type: relation.storedType,
          note: relation.storedNote ?? null,
          ...(ownerFirst
            ? { firstSortOrder: index }
            : { secondSortOrder: index }),
        },
      })
      .run();
  }
}

export function deleteRelations(tx: any, schema: any, owner: RelationEndpoint) {
  tx.delete(schema.entityRelations).where(rowMatches(schema, owner)).run();
}

/** One relation read from its owner's side, before its target is looked up. */
export type RelationRow = {
  other: RelationEndpoint;
  type: RelationType;
  note?: RelationNote;
  /** The owner's own position for it. */
  order: number;
};

/**
 * An entity's relations as stored, read from its side and in its own order.
 *
 * The cheap half of a relation list: who the other end is and what the
 * relation says, without touching the other end itself. Whoever needs the
 * other end loads the targets in one go.
 */
export function readRelationRows(owner: RelationEndpoint): RelationRow[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.entityRelations)
    .where(rowMatches(schema, owner))
    .all()
    .map((row): RelationRow => {
      const first = ownerIsFirst(row, owner);
      const [a, b] = rowEndpoints(row);
      return {
        other: first ? b : a,
        type: fromStoredRelationType(row.type, first),
        note: fromStoredRelationNote(row.note ?? undefined, first),
        order: first ? row.firstSortOrder : row.secondSortOrder,
      };
    })
    .sort((a, b) => a.order - b.order);
}

export async function getRelations(
  owner: RelationEndpoint,
): Promise<RelationGetItem[]> {
  const rows = readRelationRows(owner);
  const targets = await loadRelationTargets(rows.map((row) => row.other));
  const items = await Promise.all(
    rows.map(async (row) => {
      const found = targets.get(relationEndpointKey(row.other));
      // A relation can outlive its target only through a bug, and a broken
      // row should not take the whole page down with it.
      if (!found) return undefined;
      return {
        entityType: row.other.type,
        entityId: row.other.id,
        title: found.title,
        summary: found.summary,
        humanReadableSlug: found.humanReadableSlug,
        publicId: found.publicId,
        ...(found.date ? { date: found.date } : {}),
        type: row.type,
        note: row.note,
        iconMedia: await relationIconMedia(row.other),
      } satisfies RelationGetItem;
    }),
  );
  return items.filter((item) => item !== undefined);
}

export function toStoredRelationType(
  type: RelationType,
  ownerFirst: boolean,
): StoredRelationType {
  if (type === 'related') return 'related';
  const ownerInfluencesOther = type === 'dependent';
  return ownerInfluencesOther === ownerFirst
    ? 'first-influences-second'
    : 'second-influences-first';
}

export function fromStoredRelationType(
  type: StoredRelationType,
  ownerFirst: boolean,
): RelationType {
  if (type === 'related') return 'related';
  const firstInfluencesSecond = type === 'first-influences-second';
  const ownerInfluencesOther = firstInfluencesSecond === ownerFirst;
  return ownerInfluencesOther ? 'dependent' : 'influencing';
}

export function toStoredRelationNote(
  note: RelationNote | undefined,
  ownerFirst: boolean,
): StoredRelationNote | undefined {
  if (!note || note.type === 'shared') return note;
  return {
    type: 'split',
    firstText: ownerFirst ? note.currentText : note.relatedText,
    secondText: ownerFirst ? note.relatedText : note.currentText,
  };
}

export function fromStoredRelationNote(
  note: StoredRelationNote | undefined,
  ownerFirst: boolean,
): RelationNote | undefined {
  if (!note || note.type === 'shared') return note;
  return {
    type: 'split',
    currentText: ownerFirst ? note.firstText : note.secondText,
    relatedText: ownerFirst ? note.secondText : note.firstText,
  };
}

function nextRelationOrder(tx: any, schema: any, owner: RelationEndpoint) {
  const rows = tx
    .select()
    .from(schema.entityRelations)
    .where(rowMatches(schema, owner))
    .all();
  return (
    rows.reduce(
      (max: number, row: any) =>
        Math.max(
          max,
          ownerIsFirst(row, owner) ? row.firstSortOrder : row.secondSortOrder,
        ),
      -1,
    ) + 1
  );
}
