import { and, eq, or } from 'drizzle-orm';
import {
  relationEndpointKey,
  relationEndpointsEqual,
  type RelationEditItem,
  type RelationEndpoint,
  type RelationGetItem,
  type RelationNote,
  type RelationType,
} from '#layers/thei/shared/relation';
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

type PreparedRelation = RelationEditItem & {
  first: RelationEndpoint;
  second: RelationEndpoint;
  storedType: StoredRelationType;
  storedNote?: StoredRelationNote;
};

/**
 * The canonical order of a pair.
 *
 * A relation is one row, not two, so both ends have to agree on which of them
 * is written first — otherwise the same relation could be recorded twice, once
 * from each side.
 */
function canonicalPair(
  a: RelationEndpoint,
  b: RelationEndpoint,
): [RelationEndpoint, RelationEndpoint] {
  return relationEndpointKey(a).localeCompare(relationEndpointKey(b)) < 0
    ? [a, b]
    : [b, a];
}

function pairKey(first: RelationEndpoint, second: RelationEndpoint) {
  return `${relationEndpointKey(first)}\0${relationEndpointKey(second)}`;
}

/**
 * The other end of a relation, described the way a list needs it.
 *
 * A diary entry has no title, slug or public ID, so its day stands in for all
 * three: it is what the entry is called, what its address is built from, and
 * what identifies it.
 */
async function findEntity(endpoint: RelationEndpoint): Promise<
  | {
      title: string;
      summary: string;
      humanReadableSlug: string;
      publicId: string;
      date?: string;
    }
  | undefined
> {
  if (endpoint.type === 'project') {
    const project = await THEI_SERVER.projects.findByUuid(endpoint.id);
    return project && { ...project, date: undefined };
  }
  if (endpoint.type === 'event') {
    const stored = await THEI_SERVER.events.findByUuid(endpoint.id);
    return stored && { ...stored, date: undefined };
  }
  const entry = await THEI_SERVER.diary.findByUuid(endpoint.id);
  return (
    entry && {
      title: entry.date,
      summary: '',
      humanReadableSlug: '',
      publicId: '',
      date: entry.date,
    }
  );
}

function rowEndpoints(row: any): [RelationEndpoint, RelationEndpoint] {
  return [
    { type: row.firstType, id: row.firstId },
    { type: row.secondType, id: row.secondId },
  ];
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

export async function prepareRelations(
  owner: RelationEndpoint,
  relations: RelationEditItem[] | undefined,
): Promise<PreparedRelation[] | undefined> {
  if (relations === undefined) return undefined;

  for (const relation of relations) {
    const target: RelationEndpoint = {
      type: relation.entityType,
      id: relation.entityId,
    };
    if (relationEndpointsEqual(target, owner))
      throw new Error('An entity cannot be related to itself');
    if (!(await findEntity(target)))
      throw new Error('Related entity not found');
  }

  return relations.map((relation) => {
    const target: RelationEndpoint = {
      type: relation.entityType,
      id: relation.entityId,
    };
    const [first, second] = canonicalPair(owner, target);
    const ownerIsFirst = relationEndpointsEqual(owner, first);
    return {
      ...relation,
      first,
      second,
      storedType: toStoredRelationType(relation.type, ownerIsFirst),
      storedNote: toStoredRelationNote(relation.note, ownerIsFirst),
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
  const nextPairs = new Set(
    relations.map((item) => pairKey(item.first, item.second)),
  );

  for (const row of existing) {
    const [first, second] = rowEndpoints(row);
    if (nextPairs.has(pairKey(first, second))) continue;
    tx.delete(schema.entityRelations)
      .where(
        and(
          eq(schema.entityRelations.firstType, row.firstType),
          eq(schema.entityRelations.firstId, row.firstId),
          eq(schema.entityRelations.secondType, row.secondType),
          eq(schema.entityRelations.secondId, row.secondId),
        ),
      )
      .run();
  }

  for (let index = 0; index < relations.length; index++) {
    const relation = relations[index]!;
    const ownerIsFirst = relationEndpointsEqual(owner, relation.first);
    const previous = existing.find(
      (row: any) =>
        row.firstType === relation.first.type &&
        row.firstId === relation.first.id &&
        row.secondType === relation.second.type &&
        row.secondId === relation.second.id,
    );
    const other = ownerIsFirst ? relation.second : relation.first;
    // The other entity's ordering is its own business: an existing row keeps
    // the position it had there, and a new one lands at the end of its list.
    const otherSortOrder =
      previous === undefined
        ? nextRelationOrder(tx, schema, other)
        : ownerIsFirst
          ? previous.secondSortOrder
          : previous.firstSortOrder;

    tx.insert(schema.entityRelations)
      .values({
        firstType: relation.first.type,
        firstId: relation.first.id,
        secondType: relation.second.type,
        secondId: relation.second.id,
        type: relation.storedType,
        note: relation.storedNote,
        firstSortOrder: ownerIsFirst ? index : otherSortOrder,
        secondSortOrder: ownerIsFirst ? otherSortOrder : index,
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
          note: relation.storedNote,
          ...(ownerIsFirst
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

export async function getRelations(
  owner: RelationEndpoint,
): Promise<RelationGetItem[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.entityRelations)
    .where(rowMatches(schema, owner))
    .all()
    .sort((a, b) => relationOrder(a, owner) - relationOrder(b, owner));

  const items = await Promise.all(
    rows.map(async (row) => {
      const [first, second] = rowEndpoints(row);
      const ownerIsFirst = relationEndpointsEqual(owner, first);
      const other = ownerIsFirst ? second : first;
      const entity = await findEntity(other);
      // A relation can outlive its target only through a bug, and a broken
      // row should not take the whole page down with it.
      if (!entity) return undefined;
      const iconMedia = await relationIconMedia(other);
      return {
        entityType: other.type,
        entityId: other.id,
        title: entity.title,
        summary: entity.summary,
        humanReadableSlug: entity.humanReadableSlug,
        publicId: entity.publicId,
        ...(entity.date ? { date: entity.date } : {}),
        type: fromStoredRelationType(row.type, ownerIsFirst),
        note: fromStoredRelationNote(row.note ?? undefined, ownerIsFirst),
        iconMedia,
      };
    }),
  );
  return items.filter((item) => Boolean(item)) as RelationGetItem[];
}

export function toStoredRelationType(
  type: RelationType,
  ownerIsFirst: boolean,
): StoredRelationType {
  if (type === 'related') return 'related';
  const ownerInfluencesOther = type === 'dependent';
  return ownerInfluencesOther === ownerIsFirst
    ? 'first-influences-second'
    : 'second-influences-first';
}

export function fromStoredRelationType(
  type: StoredRelationType,
  ownerIsFirst: boolean,
): RelationType {
  if (type === 'related') return 'related';
  const firstInfluencesSecond = type === 'first-influences-second';
  const ownerInfluencesOther = firstInfluencesSecond === ownerIsFirst;
  return ownerInfluencesOther ? 'dependent' : 'influencing';
}

export function toStoredRelationNote(
  note: RelationNote | undefined,
  ownerIsFirst: boolean,
): StoredRelationNote | undefined {
  if (!note || note.type === 'shared') return note;
  return {
    type: 'split',
    firstText: ownerIsFirst ? note.currentText : note.relatedText,
    secondText: ownerIsFirst ? note.relatedText : note.currentText,
  };
}

export function fromStoredRelationNote(
  note: StoredRelationNote | undefined,
  ownerIsFirst: boolean,
): RelationNote | undefined {
  if (!note || note.type === 'shared') return note;
  return {
    type: 'split',
    currentText: ownerIsFirst ? note.firstText : note.secondText,
    relatedText: ownerIsFirst ? note.secondText : note.firstText,
  };
}

function relationOrder(row: any, owner: RelationEndpoint) {
  return row.firstType === owner.type && row.firstId === owner.id
    ? row.firstSortOrder
    : row.secondSortOrder;
}

function nextRelationOrder(tx: any, schema: any, owner: RelationEndpoint) {
  const rows = tx
    .select()
    .from(schema.entityRelations)
    .where(rowMatches(schema, owner))
    .all();
  return (
    rows.reduce(
      (max: number, row: any) => Math.max(max, relationOrder(row, owner)),
      -1,
    ) + 1
  );
}

/**
 * The entities of one kind related to an entity, for the other side's lists.
 *
 * Used where a page shows related entities of a particular kind — a project's
 * related events, say — without caring about the relation's direction.
 */
export async function listRelatedOfType(
  owner: RelationEndpoint,
  type: RelationEndpoint['type'],
): Promise<RelationEndpoint[]> {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.entityRelations)
    .where(rowMatches(schema, owner))
    .all()
    .sort((a, b) => relationOrder(a, owner) - relationOrder(b, owner))
    .map((row) => {
      const [first, second] = rowEndpoints(row);
      return relationEndpointsEqual(owner, first) ? second : first;
    })
    .filter((endpoint) => endpoint.type === type);
}
