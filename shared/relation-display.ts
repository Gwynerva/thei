import type { RelationEntityType, RelationType } from './relation';
import type { LanguagePhrases } from './language/types';
import { entityTypeIcon } from './entity-icon';

/**
 * How each kind of relation is drawn and named from this entity's side, in
 * one place: its icon, the title of its group, its word in the editor's
 * list, and the sentence that says it with both names.
 */
const RELATION_TYPE_DISPLAY = {
  related: {
    icon: 'relation-related',
    group: 'relation_group_related',
    sentence: 'relation_popup_related',
  },
  influencing: {
    icon: 'relation-depends',
    group: 'relation_group_depends_on',
    sentence: 'relation_popup_depends_on',
  },
  dependent: {
    icon: 'relation-affects',
    group: 'relation_group_affects',
    sentence: 'relation_popup_affects',
  },
} as const satisfies Record<
  RelationType,
  {
    icon: string;
    group: keyof LanguagePhrases;
    sentence: keyof LanguagePhrases;
  }
>;

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
  return RELATION_TYPE_DISPLAY[type].icon;
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
  return RELATION_TYPE_DISPLAY[type].group;
}

/** A kind's word in the editor's list, from the side of `owner`. */
export function relationShortLabel(
  phrase: LanguagePhrases,
  type: RelationType,
  owner: RelationEntityType,
): string {
  if (type === 'influencing') return phrase.relation_short_depends_on;
  if (type === 'dependent') return phrase.relation_short_affects;
  return phrase.relation_short_related(owner);
}

/**
 * What a relation says with both names in it: "A depends on B" reads at
 * once, where "Depends on" alone still asks which side is which.
 */
export function relationSentence(
  phrase: LanguagePhrases,
  type: RelationType,
  current: string,
  other: string,
): string {
  return phrase[RELATION_TYPE_DISPLAY[type].sentence](current, other);
}

/** The icon for the kind of thing on the other end of a relation. */
export function relationEntityIcon(type: RelationEntityType) {
  return entityTypeIcon(type);
}
