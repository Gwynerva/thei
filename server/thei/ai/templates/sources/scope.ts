import { inArray } from 'drizzle-orm';
import type { EntityKey } from '../../../entity-kinds';
import { isFileKey, type ActionTarget } from '../../actions/target';

/**
 * What a run from a ✦, or one the owner's words name entities for, covers:
 * entities, and files of the library.
 */

/** Whether an entity or a file is one of the scope's, by kind and id. */
export function inScope(
  scope: readonly ActionTarget[] | undefined,
  key: Pick<ActionTarget, 'kind' | 'id'>,
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
  scope: readonly ActionTarget[] | undefined,
): ActionTarget[] | undefined {
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

/**
 * The entities of a scope, files left out: none when it names only files,
 * every one when there is no scope.
 */
export function entitiesOf(
  scope: readonly ActionTarget[] | undefined,
): EntityKey[] | undefined {
  return scope?.filter((key): key is EntityKey => !isFileKey(key));
}
