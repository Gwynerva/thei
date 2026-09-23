import { and, eq, or } from 'drizzle-orm';
import {
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
} from './db/schema/project-relations';
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

/** The primary key of a row: its project end and the entity it points at. */
type RelationRowKey = {
  projectUuid: string;
  entityType: RelationEndpoint['type'];
  entityId: string;
};

type PreparedRelation = RelationEditItem & {
  row: RelationRowKey;
  storedType: StoredRelationType;
  storedNote?: StoredRelationNote;
};

/**
 * How a pair is written down, and whether `a` is the row's project end.
 *
 * A relation is one row, not two. Its project end is the project; between two
 * projects, the smaller ID is, so both of them agree on how the pair is
 * written and the same relation cannot be recorded twice.
 */
function rowKey(
  a: RelationEndpoint,
  b: RelationEndpoint,
): [RelationRowKey, boolean] {
  const aIsProjectEnd =
    a.type === 'project' &&
    (b.type !== 'project' || a.id.localeCompare(b.id) <= 0);
  const [project, other] = aIsProjectEnd ? [a, b] : [b, a];
  if (project.type !== 'project')
    throw new Error('A relation has to be drawn from a project');
  return [
    { projectUuid: project.id, entityType: other.type, entityId: other.id },
    aIsProjectEnd,
  ];
}

function rowKeyString(key: RelationRowKey) {
  return `${key.projectUuid}\0${key.entityType}:${key.entityId}`;
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
    { type: 'project', id: row.projectUuid },
    { type: row.entityType, id: row.entityId },
  ];
}

/** Whether the owner is the row's project end, rather than its other end. */
function ownerIsProjectEnd(row: any, owner: RelationEndpoint) {
  return owner.type === 'project' && row.projectUuid === owner.id;
}

function rowMatches(schema: any, owner: RelationEndpoint) {
  const asEntity = and(
    eq(schema.projectRelations.entityType, owner.type),
    eq(schema.projectRelations.entityId, owner.id),
  );
  return owner.type === 'project'
    ? or(eq(schema.projectRelations.projectUuid, owner.id), asEntity)
    : asEntity;
}

function rowWhere(schema: any, key: RelationRowKey) {
  return and(
    eq(schema.projectRelations.projectUuid, key.projectUuid),
    eq(schema.projectRelations.entityType, key.entityType),
    eq(schema.projectRelations.entityId, key.entityId),
  );
}

/**
 * Checks and translates the relation list a project is saved with.
 *
 * Only a project edits its relations. An event or a diary entry reads the
 * same rows from its side, but never writes them.
 */
export async function prepareRelations(
  owner: RelationEndpoint,
  relations: RelationEditItem[] | undefined,
): Promise<PreparedRelation[] | undefined> {
  if (relations === undefined) return undefined;
  if (owner.type !== 'project')
    throw new Error('Only a project can edit its relations');

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
    const [row, ownerIsProject] = rowKey(owner, {
      type: relation.entityType,
      id: relation.entityId,
    });
    return {
      ...relation,
      row,
      storedType: toStoredRelationType(relation.type, ownerIsProject),
      storedNote: toStoredRelationNote(relation.note, ownerIsProject),
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
    .from(schema.projectRelations)
    .where(rowMatches(schema, owner))
    .all();
  const nextRows = new Set(relations.map((item) => rowKeyString(item.row)));

  for (const row of existing) {
    if (nextRows.has(rowKeyString(row))) continue;
    tx.delete(schema.projectRelations).where(rowWhere(schema, row)).run();
  }

  for (let index = 0; index < relations.length; index++) {
    const relation = relations[index]!;
    const ownerIsProject =
      owner.type === 'project' && relation.row.projectUuid === owner.id;
    const previous = existing.find(
      (row: any) => rowKeyString(row) === rowKeyString(relation.row),
    );
    const other: RelationEndpoint = ownerIsProject
      ? { type: relation.row.entityType, id: relation.row.entityId }
      : { type: 'project', id: relation.row.projectUuid };
    // The other entity's ordering is its own business: an existing row keeps
    // the position it had there, and a new one lands at the end of its list.
    const otherSortOrder =
      previous === undefined
        ? nextRelationOrder(tx, schema, other)
        : ownerIsProject
          ? previous.entitySortOrder
          : previous.projectSortOrder;

    tx.insert(schema.projectRelations)
      .values({
        ...relation.row,
        type: relation.storedType,
        note: relation.storedNote,
        projectSortOrder: ownerIsProject ? index : otherSortOrder,
        entitySortOrder: ownerIsProject ? otherSortOrder : index,
      })
      .onConflictDoUpdate({
        target: [
          schema.projectRelations.projectUuid,
          schema.projectRelations.entityType,
          schema.projectRelations.entityId,
        ],
        set: {
          type: relation.storedType,
          note: relation.storedNote,
          ...(ownerIsProject
            ? { projectSortOrder: index }
            : { entitySortOrder: index }),
        },
      })
      .run();
  }
}

export function deleteRelations(tx: any, schema: any, owner: RelationEndpoint) {
  tx.delete(schema.projectRelations).where(rowMatches(schema, owner)).run();
}

export async function getRelations(
  owner: RelationEndpoint,
): Promise<RelationGetItem[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.projectRelations)
    .where(rowMatches(schema, owner))
    .all()
    .sort((a, b) => relationOrder(a, owner) - relationOrder(b, owner));

  const items = await Promise.all(
    rows.map(async (row) => {
      const [project, entity] = rowEndpoints(row);
      const ownerIsProject = ownerIsProjectEnd(row, owner);
      const other = ownerIsProject ? entity : project;
      const found = await findEntity(other);
      // A relation can outlive its target only through a bug, and a broken
      // row should not take the whole page down with it.
      if (!found) return undefined;
      const iconMedia = await relationIconMedia(other);
      return {
        entityType: other.type,
        entityId: other.id,
        title: found.title,
        summary: found.summary,
        humanReadableSlug: found.humanReadableSlug,
        publicId: found.publicId,
        ...(found.date ? { date: found.date } : {}),
        type: fromStoredRelationType(row.type, ownerIsProject),
        note: fromStoredRelationNote(row.note ?? undefined, ownerIsProject),
        iconMedia,
      };
    }),
  );
  return items.filter((item) => Boolean(item)) as RelationGetItem[];
}

export function toStoredRelationType(
  type: RelationType,
  ownerIsProject: boolean,
): StoredRelationType {
  if (type === 'related') return 'related';
  const ownerInfluencesOther = type === 'dependent';
  return ownerInfluencesOther === ownerIsProject
    ? 'project-influences-entity'
    : 'entity-influences-project';
}

export function fromStoredRelationType(
  type: StoredRelationType,
  ownerIsProject: boolean,
): RelationType {
  if (type === 'related') return 'related';
  const projectInfluencesEntity = type === 'project-influences-entity';
  const ownerInfluencesOther = projectInfluencesEntity === ownerIsProject;
  return ownerInfluencesOther ? 'dependent' : 'influencing';
}

export function toStoredRelationNote(
  note: RelationNote | undefined,
  ownerIsProject: boolean,
): StoredRelationNote | undefined {
  if (!note || note.type === 'shared') return note;
  return {
    type: 'split',
    projectText: ownerIsProject ? note.currentText : note.relatedText,
    entityText: ownerIsProject ? note.relatedText : note.currentText,
  };
}

export function fromStoredRelationNote(
  note: StoredRelationNote | undefined,
  ownerIsProject: boolean,
): RelationNote | undefined {
  if (!note || note.type === 'shared') return note;
  return {
    type: 'split',
    currentText: ownerIsProject ? note.projectText : note.entityText,
    relatedText: ownerIsProject ? note.entityText : note.projectText,
  };
}

function relationOrder(row: any, owner: RelationEndpoint) {
  return ownerIsProjectEnd(row, owner)
    ? row.projectSortOrder
    : row.entitySortOrder;
}

function nextRelationOrder(tx: any, schema: any, owner: RelationEndpoint) {
  const rows = tx
    .select()
    .from(schema.projectRelations)
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
    .from(schema.projectRelations)
    .where(rowMatches(schema, owner))
    .all()
    .sort((a, b) => relationOrder(a, owner) - relationOrder(b, owner))
    .map((row) => {
      const [project, entity] = rowEndpoints(row);
      return ownerIsProjectEnd(row, owner) ? entity : project;
    })
    .filter((endpoint) => endpoint.type === type);
}
