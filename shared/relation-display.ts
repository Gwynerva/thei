import type { RelationEntityType, RelationType } from './relation';
import { entityTypeIcon } from './entity-icon';

/**
 * The icon for a relation's direction.
 *
 * Deliberately frameless, unlike the old project-shaped marks: a relation may
 * now join an event as easily as a project, so the icon has to say what the
 * relation is rather than what kind of thing is on the other end.
 */
export function relationTypeIcon(type: RelationType) {
  if (type === 'influencing') return 'relation-depends' as const;
  if (type === 'dependent') return 'relation-affects' as const;
  return 'relation-related' as const;
}

/** The icon for the kind of thing on the other end of a relation. */
export function relationEntityIcon(type: RelationEntityType) {
  return entityTypeIcon(type);
}
