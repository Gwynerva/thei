import type { PublicTagListItem } from '#layers/thei/shared/api/public';
import { buildPublicTagListItems, canListPublicEntity } from '../../thei/public/entities';

export default defineEventHandler(async (event): Promise<PublicTagListItem[]> => {
  const isAdmin = await THEI_SERVER.isAdmin(event);
  const { db, schema } = THEI_SERVER.useDb();
  const [tags, usages, projects, events] = [
    db.select().from(schema.tags).all(),
    db.select().from(schema.tagUsages).all(),
    db.select().from(schema.projects).all(),
    db.select().from(schema.events).all(),
  ];
  const visibleProjects = new Set(
    projects.filter((item) => canListPublicEntity(item.access, isAdmin)).map((item) => item.projectUuid),
  );
  const visibleEvents = new Set(
    events.filter((item) => canListPublicEntity(item.access, isAdmin)).map((item) => item.eventUuid),
  );
  const rows = tags
    .map((tag) => ({
      tag,
      projectCount: usages.filter(
        (usage) =>
          usage.tagUuid === tag.tagUuid &&
          usage.containerType === 'project' &&
          visibleProjects.has(usage.containerId),
      ).length,
      eventCount: usages.filter(
        (usage) =>
          usage.tagUuid === tag.tagUuid &&
          usage.containerType === 'event' &&
          visibleEvents.has(usage.containerId),
      ).length,
    }))
    .filter((item) => item.projectCount + item.eventCount > 0)
    .sort((left, right) => left.tag.title.localeCompare(right.tag.title));
  return buildPublicTagListItems(rows);
});
