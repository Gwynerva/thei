import type { ContentEntitySearchItem } from './admin/content-entity-search';
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

/**
 * One entity's reading of a relation: always relative to the entity itself.
 * "influencing" reads "this depends on the other", "dependent" reads "this
 * affects the other".
 */
export const RELATION_TYPES = ['related', 'influencing', 'dependent'] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export function isRelationType(value: unknown): value is RelationType {
  return RELATION_TYPES.includes(value as RelationType);
}

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

/**
 * The other end of a relation as the entity search found it: what a chip
 * and the modal show of it. `date` is always set, absent or not, so the end
 * picked replaces every field of the one before.
 */
export function relationEndOf(
  entity: Pick<
    ContentEntitySearchItem,
    | 'entityId'
    | 'title'
    | 'summary'
    | 'humanReadableSlug'
    | 'publicId'
    | 'date'
    | 'previewMedia'
  > & { entityType: RelationEntityType },
): Omit<RelationEditItem, 'type' | 'note'> {
  return {
    entityType: entity.entityType,
    entityId: entity.entityId,
    title: entity.title,
    summary: entity.summary,
    humanReadableSlug: entity.humanReadableSlug,
    publicId: entity.publicId,
    date: entity.date,
    iconMedia: entity.previewMedia,
  };
}

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

/** Whether a relation says anything of its own, on either side. */
export function relationHasNote(note: RelationNote | undefined): boolean {
  if (!note) return false;
  return note.type === 'shared'
    ? Boolean(note.text?.trim())
    : Boolean(note.currentText?.trim() || note.relatedText?.trim());
}

/**
 * A note written once, made into one per side: each side starts from what
 * was written for both, to be told apart from there.
 */
export function splitRelationNote(
  note: RelationNote | undefined,
): RelationNote {
  if (note?.type === 'split') return note;
  const text = note?.text ?? '';
  return { type: 'split', currentText: text, relatedText: text };
}

/**
 * Notes per side, made into one again. Nothing written is lost: the same
 * text stays as it is, a lone side's text is taken, and two different texts
 * are joined with a dash.
 */
export function mergeRelationNote(
  note: RelationNote | undefined,
): RelationNote {
  if (note?.type !== 'split') return { type: 'shared', text: note?.text ?? '' };
  const current = note.currentText ?? '';
  const related = note.relatedText ?? '';
  const text =
    current === related || !related
      ? current
      : !current
        ? related
        : `${current} — ${related}`;
  return { type: 'shared', text };
}

export function relationEndpointKey(endpoint: RelationEndpoint) {
  return `${endpoint.type}:${endpoint.id}`;
}

/**
 * A relation list in the order its editor keeps it: one kind after another,
 * projects and events in their own hand-made order, diary entries by their
 * days, newest first. The editor writes every change in this order, and the
 * edit API reads a list out in it, so a list that was not changed compares
 * equal to the one that was loaded. How the kinds interleave in storage —
 * a relation drawn from the other end lands wherever it lands — means
 * nothing to anyone: every list of relations is shown one kind at a time.
 */
export function orderRelationsForEditing<
  T extends { entityType: RelationEntityType; date?: string },
>(items: readonly T[]): T[] {
  return RELATION_ENTITY_TYPES.flatMap((type) => {
    const kind = items.filter((item) => item.entityType === type);
    return type === 'diary-entry'
      ? kind.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      : kind;
  });
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
    if (!isRelationType(relation.type))
      throw new RelationValidationError('Invalid relation type');
    return {
      entityType: relation.entityType,
      entityId,
      type: relation.type,
      note: validateRelationNote(relation.note),
    };
  });
}
