import type { MediaDescriptor } from './media';

/**
 * The kinds of entity a relation can join.
 *
 * A relation joins any two of the three, and either end edits it: both ends
 * read the same row, each from its own side.
 */
export const RELATION_ENTITY_TYPES = [
  'project',
  'event',
  'diary-entry',
] as const;
export type RelationEntityType = (typeof RELATION_ENTITY_TYPES)[number];

export type RelationEndpoint = {
  type: RelationEntityType;
  id: string;
};

export function isRelationEntityType(
  value: unknown,
): value is RelationEntityType {
  return RELATION_ENTITY_TYPES.includes(value as RelationEntityType);
}

/** One entity's reading of a relation: always relative to the entity itself. */
export type RelationType = 'related' | 'influencing' | 'dependent';

export type RelationNote =
  | { type: 'shared'; text?: string }
  | {
      type: 'split';
      /** What this side says about the relation. */
      currentText?: string;
      /** What the other side says about it. */
      relatedText?: string;
    };

/** A relation as the entity being edited sees it. */
export type RelationEditItem = {
  entityType: RelationEntityType;
  entityId: string;
  type: RelationType;
  note?: RelationNote;
  /** Display fields returned by the admin edit API and ignored when saving. */
  title?: string;
  summary?: string;
  humanReadableSlug?: string;
  publicId?: string;
  /** Set on diary entries, which have a day instead of a title. */
  date?: string;
  iconMedia?: MediaDescriptor;
};

export type RelationGetItem = RelationEditItem & {
  title: string;
  humanReadableSlug: string;
  publicId: string;
  /**
   * A project always has one; an event only has whatever its body opens with,
   * so this can be absent and the caller draws a fallback.
   */
  iconMedia?: MediaDescriptor;
};

export function relationEndpointKey(endpoint: RelationEndpoint) {
  return `${endpoint.type}:${endpoint.id}`;
}

export function relationEndpointsEqual(
  left: RelationEndpoint,
  right: RelationEndpoint,
) {
  return left.type === right.type && left.id === right.id;
}

export class RelationValidationError extends Error {}

function trimmed(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text || undefined;
}

export function validateRelationNote(
  note: RelationNote | undefined,
): RelationNote | undefined {
  if (note === undefined) return undefined;
  if (note.type === 'shared')
    return { type: 'shared', text: trimmed(note.text) };
  if (note.type === 'split')
    return {
      type: 'split',
      currentText: trimmed(note.currentText),
      relatedText: trimmed(note.relatedText),
    };
  throw new RelationValidationError('Invalid relation note');
}

/**
 * Validates the relation list an entity is saved with.
 *
 * Shared by the project, the event and the diary entry forms, so the three
 * cannot drift into accepting different things.
 */
export function validateRelations(
  relations: RelationEditItem[] | undefined,
): RelationEditItem[] | undefined {
  if (relations === undefined) return undefined;
  if (!Array.isArray(relations))
    throw new RelationValidationError('Invalid related entities');
  const seen = new Set<string>();
  return relations.map((relation) => {
    const entityId = relation.entityId?.trim();
    if (!entityId || !isRelationEntityType(relation.entityType))
      throw new RelationValidationError('Invalid related entity');
    const key = relationEndpointKey({
      type: relation.entityType,
      id: entityId,
    });
    if (seen.has(key))
      throw new RelationValidationError('Duplicate related entity');
    seen.add(key);
    if (
      relation.type !== 'related' &&
      relation.type !== 'influencing' &&
      relation.type !== 'dependent'
    )
      throw new RelationValidationError('Invalid relation type');
    return {
      entityType: relation.entityType,
      entityId,
      type: relation.type,
      note: validateRelationNote(relation.note),
    };
  });
}
