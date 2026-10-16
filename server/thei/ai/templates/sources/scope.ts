import { inArray } from 'drizzle-orm';
import type { EntityKey } from '../../../entity-kinds';

/** What a run from a ✦, or one the owner's words name entities for, covers. */

/** Whether an entity is one of the scope's, by kind and stored id. */
export function inScope(
  scope: readonly EntityKey[] | undefined,
  key: Pick<EntityKey, 'kind' | 'id'>,
) {
  return (
    !scope || scope.some((item) => item.kind === key.kind && item.id === key.id)
  );
}

/**
 * A scope widened to what belongs to it: a project's sections are read with
 * the project.
 */
export function withSections(
  scope: readonly EntityKey[] | undefined,
): EntityKey[] | undefined {
  if (!scope) return undefined;
  const projects = scope.filter((key) => key.kind === 'project');
  if (!projects.length) return [...scope];
  const { db, schema } = THEI_SERVER.useDb();
  const sections = db
    .select({ id: schema.projectContentSections.sectionUuid })
    .from(schema.projectContentSections)
    .where(
      inArray(
        schema.projectContentSections.projectUuid,
        projects.map((key) => key.id),
      ),
    )
    .all() as { id: string }[];
  return [
    ...scope,
    ...sections.map((section) => ({
      kind: 'project-section' as const,
      id: section.id,
    })),
  ];
}
