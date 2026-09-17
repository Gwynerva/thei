import type {
  PublicEntitySummary,
  PublicPaginatedResponse,
} from '#layers/thei/shared/api/public';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { getEventPeriods } from '../events/periods';
import { listRelatedEventsForProject } from '../events/relations';
import { buildPublicEventSummary, canListPublicEntity } from './entities';
import { publicPagination } from './pagination';

type ProjectRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.projects.findByUuid>>
>;

export const PROJECT_EVENTS_PREVIEW_SIZE = 3;
export const PROJECT_EVENTS_PAGE_SIZE = 24;

/** The date an event is listed under: its latest period end, else creation. */
export function publicEventListDate(
  periods: { endDate: string }[],
  createdAt: number,
): string {
  return (
    periods
      .map((period) => period.endDate)
      .sort()
      .at(-1) ?? new Date(createdAt).toISOString().slice(0, 10)
  );
}

/**
 * Events that name the project among their related projects, newest first.
 * Summaries are built for the requested page only, and the project's own chip
 * is left out of each card.
 */
export async function listPublicProjectEvents(
  project: ProjectRow,
  isAdmin: boolean,
  pageValue: unknown,
  pageSize: number,
): Promise<PublicPaginatedResponse<PublicEntitySummary>> {
  const events = listRelatedEventsForProject(project.projectUuid, isAdmin)
    .map(({ event }) => event)
    .filter((event) => canListPublicEntity(event.access, isAdmin))
    .map((event) => ({
      event,
      date: publicEventListDate(
        getEventPeriods(event.eventUuid),
        event.createdAt,
      ),
    }))
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.event.createdAt - left.event.createdAt,
    );
  const pagination = publicPagination(events.length, pageValue, pageSize);
  const offset = (pagination.page - 1) * pageSize;
  const projectHref = buildProjectUrl(
    project.humanReadableSlug,
    project.publicId,
  );
  const items = await Promise.all(
    events.slice(offset, offset + pageSize).map(async ({ event }) => {
      const summary = await buildPublicEventSummary(event, isAdmin);
      return {
        ...summary,
        relatedProjects: summary.relatedProjects?.filter(
          (related) => !('href' in related) || related.href !== projectHref,
        ),
      };
    }),
  );
  return { items, ...pagination };
}
