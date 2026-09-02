import { asc, count, desc, eq } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type {
  PublicEntitySummary,
  PublicPaginatedResponse,
} from '#layers/thei/shared/api/public';
import { buildPublicProjectSummary } from '../../thei/public/entities';
import { publicPagination } from '../../thei/public/pagination';

export default defineEventHandler(
  async (event): Promise<PublicPaginatedResponse<PublicEntitySummary>> => {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    const {
      db,
      schema: { projects },
    } = THEI_SERVER.useDb();
    const visible = isAdmin
      ? undefined
      : eq(projects.access, ProjectEventAccessLevel.Public);
    const total = db
      .select({ count: count() })
      .from(projects)
      .where(visible)
      .get()!.count;
    const pagination = publicPagination(total, getQuery(event).page);
    const selected = db
      .select()
      .from(projects)
      .where(visible)
      .orderBy(
        desc(projects.showcase),
        desc(projects.createdAt),
        asc(projects.projectUuid),
      )
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize)
      .all();
    return {
      ...pagination,
      items: await Promise.all(selected.map(buildPublicProjectSummary)),
    };
  },
);
