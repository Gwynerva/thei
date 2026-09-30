import { and, count, eq, inArray } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { canListPublicEntity } from './entities';

/**
 * How many projects and events carry each tag, as a reader may list them.
 *
 * Shared by the tags page, the home page and the Open Graph cards of both,
 * so a card never counts a tag differently from the page it previews. Tags
 * nobody may list anything under are left out, as the pages leave them.
 */
export function listPublicTagCounts(isAdmin: boolean) {
  const { db, schema } = THEI_SERVER.useDb();
  const visible = (rows: { id: string; access: ProjectEventAccessLevel }[]) =>
    new Set(
      rows
        .filter((row) => canListPublicEntity(row.access, isAdmin))
        .map((row) => row.id),
    );
  const visibleProjects = visible(
    db
      .select({
        id: schema.projects.projectUuid,
        access: schema.projects.access,
      })
      .from(schema.projects)
      .all(),
  );
  const visibleEvents = visible(
    db
      .select({ id: schema.events.eventUuid, access: schema.events.access })
      .from(schema.events)
      .all(),
  );
  // One pass over the usages, rather than one per tag.
  const counts = new Map<
    string,
    { projectCount: number; eventCount: number }
  >();
  for (const usage of db.select().from(schema.tagUsages).all()) {
    const isProject =
      usage.containerType === 'project' &&
      visibleProjects.has(usage.containerId);
    const isEvent =
      usage.containerType === 'event' && visibleEvents.has(usage.containerId);
    if (!isProject && !isEvent) continue;
    const entry = counts.get(usage.tagUuid) ?? {
      projectCount: 0,
      eventCount: 0,
    };
    if (isProject) entry.projectCount++;
    else entry.eventCount++;
    counts.set(usage.tagUuid, entry);
  }
  return db
    .select()
    .from(schema.tags)
    .all()
    .map((tag) => ({
      tag,
      ...(counts.get(tag.tagUuid) ?? { projectCount: 0, eventCount: 0 }),
    }))
    .filter((item) => item.projectCount + item.eventCount > 0);
}

/**
 * The conditions that pick one tag's projects and events a reader may list;
 * a visitor sees only public ones.
 */
export function publicTagItemFilters(tagUuid: string, isAdmin: boolean) {
  const {
    db,
    schema: { tagUsages, projects, events },
  } = THEI_SERVER.useDb();
  const tagged = (type: 'project' | 'event') =>
    db
      .select({ id: tagUsages.containerId })
      .from(tagUsages)
      .where(
        and(eq(tagUsages.tagUuid, tagUuid), eq(tagUsages.containerType, type)),
      );
  return {
    projectFilter: and(
      inArray(projects.projectUuid, tagged('project')),
      isAdmin ? undefined : eq(projects.access, ProjectEventAccessLevel.Public),
    ),
    eventFilter: and(
      inArray(events.eventUuid, tagged('event')),
      isAdmin ? undefined : eq(events.access, ProjectEventAccessLevel.Public),
    ),
  };
}

/** How many of a tag's projects and events a reader may list. */
export function countPublicTagItems(tagUuid: string, isAdmin: boolean) {
  const {
    db,
    schema: { projects, events },
  } = THEI_SERVER.useDb();
  const { projectFilter, eventFilter } = publicTagItemFilters(tagUuid, isAdmin);
  return {
    projectCount: db
      .select({ count: count() })
      .from(projects)
      .where(projectFilter)
      .get()!.count,
    eventCount: db
      .select({ count: count() })
      .from(events)
      .where(eventFilter)
      .get()!.count,
  };
}
