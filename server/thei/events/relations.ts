import { and, asc, eq } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { EventProjectRelationEditItem } from '#layers/thei/shared/event';
import { buildAdminAssetUrls } from '../assets/urls';
import { resolveEntityIconMedia } from '../media/generated-icon';

export async function prepareEventRelations(
  relations: EventProjectRelationEditItem[] | undefined,
) {
  if (relations === undefined) return undefined;
  for (const relation of relations) {
    if (!(await THEI_SERVER.projects.findByUuid(relation.projectUuid)))
      throw new Error('Related project not found');
  }
  return relations;
}

export function applyEventRelations(
  tx: any,
  schema: any,
  eventUuid: string,
  relations: EventProjectRelationEditItem[] | undefined,
) {
  if (relations === undefined) return;
  tx.delete(schema.eventProjectRelations)
    .where(eq(schema.eventProjectRelations.eventUuid, eventUuid))
    .run();
  relations.forEach((relation, sortOrder) => {
    tx.insert(schema.eventProjectRelations)
      .values({
        eventUuid,
        projectUuid: relation.projectUuid,
        note: relation.note,
        sortOrder,
      })
      .run();
  });
}

export async function getEventRelations(eventUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      project: schema.projects,
      note: schema.eventProjectRelations.note,
    })
    .from(schema.eventProjectRelations)
    .innerJoin(
      schema.projects,
      eq(schema.eventProjectRelations.projectUuid, schema.projects.projectUuid),
    )
    .where(eq(schema.eventProjectRelations.eventUuid, eventUuid))
    .orderBy(asc(schema.eventProjectRelations.sortOrder))
    .all();
  return Promise.all(
    rows.map(async ({ project, note }) => {
      const icon = (
        await THEI_SERVER.assets.usages.findByContainer(
          'project',
          project.projectUuid,
        )
      ).find((usage) => usage.role === 'icon');
      return {
        projectUuid: project.projectUuid,
        title: project.title,
        summary: project.summary,
        humanReadableSlug: project.humanReadableSlug,
        publicId: project.publicId,
        note: note || undefined,
        iconMedia: resolveEntityIconMedia(
          'project',
          project.projectUuid,
          icon ? (await buildAdminAssetUrls(icon.asset)).media! : undefined,
        ),
      };
    }),
  );
}

export function listRelatedEventsForProject(
  projectUuid: string,
  includeRestricted = false,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ event: schema.events, note: schema.eventProjectRelations.note })
    .from(schema.eventProjectRelations)
    .innerJoin(
      schema.events,
      eq(schema.eventProjectRelations.eventUuid, schema.events.eventUuid),
    )
    .where(
      includeRestricted
        ? eq(schema.eventProjectRelations.projectUuid, projectUuid)
        : and(
            eq(schema.eventProjectRelations.projectUuid, projectUuid),
            eq(schema.events.access, ProjectEventAccessLevel.Public),
          ),
    )
    .orderBy(asc(schema.eventProjectRelations.sortOrder))
    .all();
}
