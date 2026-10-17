import { eq } from 'drizzle-orm';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import {
  normalizePeriods,
  PERIOD_OWNER_TYPES,
  type Period,
} from '#layers/thei/shared/period';
import { isRelationEntityType } from '#layers/thei/shared/relation';
import {
  ENTITY_ACCESS,
  findEntity,
  refOf,
  tagIdOf,
  type EntityKey,
  type EntityKind,
} from '../entity-kinds';
import { refuse } from './text';

/**
 * The checks a change has to pass whoever proposes it: an action an editor's
 * key applies, or one the owner applies. One set, so an action is never
 * applied that the same change made in a form would be refused, nor the
 * other way round.
 */

/** Whether a kind has dated periods of its own. */
export function hasPeriods(kind: EntityKind): boolean {
  return (PERIOD_OWNER_TYPES as readonly string[]).includes(kind);
}

/** Periods as the site keeps them, or a refusal saying what is wrong. */
export function checkedPeriods(value: unknown): Period[] {
  try {
    return normalizePeriods(value as Period[]);
  } catch (error) {
    refuse(error instanceof Error ? error.message : 'Invalid periods.');
  }
}

/** Who may see an entity of this kind, among what the kind offers. */
export function checkedAccess(
  kind: EntityKind,
  value: unknown,
): ProjectEventAccessLevel {
  const allowed = ENTITY_ACCESS[kind];
  if (!allowed?.length) refuse(`Who sees a ${kind} is not set on its own.`);
  if (!allowed.includes(value as ProjectEventAccessLevel))
    refuse(`access of a ${kind} is one of ${allowed.join(', ')}.`);
  return value as ProjectEventAccessLevel;
}

/** The other end of a relation from `owner`, or a refusal. */
export function checkedRelationEnd(owner: EntityKey, ref: unknown): EntityKey {
  if (!isRelationEntityType(owner.kind))
    refuse('Only projects, events and diary entries have relations.');
  const other = findEntity(ref);
  if (!other) refuse(`There is no ${String(ref)}.`);
  if (!isRelationEntityType(other.kind))
    refuse('A relation joins projects, events and diary entries only.');
  if (other.kind === owner.kind && other.id === owner.id)
    refuse('An entity is not related to itself.');
  return other;
}

/** A tag that exists, by its ref. */
export function existingTag(ref: string): { ref: string; title: string } {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select({ id: schema.tags.tagUuid, title: schema.tags.title })
    .from(schema.tags)
    .where(eq(schema.tags.tagUuid, tagIdOf(ref)))
    .get();
  if (!row) refuse(`There is no ${ref}.`);
  return { ref: refOf({ kind: 'tag', id: row.id }), title: row.title };
}
