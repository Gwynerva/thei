import type { RelationEntityType, RelationType } from './relation';
import type { LanguagePhrases } from './language/types';
import { entityTypeIcon } from './entity-icon';

/**
 * How each kind of relation is drawn and named from this entity's side, in
 * one place: its icon, the word that says what the other end is to this
 * one, and the sentence that says it with both names.
 */
const RELATION_TYPE_DISPLAY = {
  related: {
    icon: 'relation-related',
    label: 'relation_label_related',
    sentence: 'relation_popup_related',
  },
  influencing: {
    icon: 'relation-depends',
    label: 'relation_label_influencing',
    sentence: 'relation_popup_depends_on',
  },
  dependent: {
    icon: 'relation-affects',
    label: 'relation_label_dependent',
    sentence: 'relation_popup_affects',
  },
} as const satisfies Record<
  RelationType,
  {
    icon: string;
    label: keyof LanguagePhrases;
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
 * The order relations are listed in, inside the list of one kind of entity.
 *
 * The directed kinds first: they are the deliberate claims, and the plain
 * "related" ones are those that grow many.
 */
export const RELATION_GROUP_ORDER: readonly RelationType[] = [
  'influencing',
  'dependent',
  'related',
];

/**
 * What the other end is to this entity, in one word under its name:
 * "Influences" when this one depends on it, "Depends" when this one affects
 * it.
 */
export function relationLabel(
  phrase: LanguagePhrases,
  type: RelationType,
): string {
  return phrase[RELATION_TYPE_DISPLAY[type].label];
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

export type RelationSentencePart = string | { side: 'current' | 'other' };

/**
 * A relation's sentence in pieces, its two names left for the caller to draw
 * — each with its picture, say. The quotes around a name go with it: the
 * picture already sets the name apart.
 */
export function relationSentenceParts(
  phrase: LanguagePhrases,
  type: RelationType,
): RelationSentencePart[] {
  const current = '\u0000';
  const other = '\u0001';
  return relationSentence(phrase, type, current, other)
    .split(/[«“"]?([\u0000\u0001])[»”"]?/)
    .filter(Boolean)
    .map((part) =>
      part === current
        ? { side: 'current' as const }
        : part === other
          ? { side: 'other' as const }
          : part,
    );
}

/** The icon for the kind of thing on the other end of a relation. */
export function relationEntityIcon(type: RelationEntityType) {
  return entityTypeIcon(type);
}
