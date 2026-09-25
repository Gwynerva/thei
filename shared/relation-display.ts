import type { RelationEntityType, RelationType } from './relation';
import { entityTypeIcon } from './entity-icon';

/**
 * The icon for a relation's direction.
 *
 * All three draw the same two ends, this entity as a filled disc and the
 * other as a ring, and influence always runs left to right: a plain line
 * for "related", and for the directed kinds a triangle pointing at the end
 * that is influenced, so "depends on" puts the ring first and "affects" the
 * disc. The icon says what the relation is, never what kind of thing is on
 * the other end.
 */
export function relationTypeIcon(type: RelationType) {
  if (type === 'influencing') return 'relation-depends' as const;
  if (type === 'dependent') return 'relation-affects' as const;
  return 'relation-related' as const;
}

/**
 * The order the three kinds are listed in, wherever they are grouped.
 *
 * The directed kinds first: they are the deliberate claims, and the plain
 * "related" list is the one that grows long.
 */
export const RELATION_GROUP_ORDER: readonly RelationType[] = [
  'influencing',
  'dependent',
  'related',
];

/** The phrase that titles a group of one kind, from this entity's side. */
export function relationGroupPhraseKey(type: RelationType) {
  if (type === 'influencing') return 'relation_group_depends_on' as const;
  if (type === 'dependent') return 'relation_group_affects' as const;
  return 'relation_group_related' as const;
}

/** The icon for the kind of thing on the other end of a relation. */
export function relationEntityIcon(type: RelationEntityType) {
  return entityTypeIcon(type);
}
