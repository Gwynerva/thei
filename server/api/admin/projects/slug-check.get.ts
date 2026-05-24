import type { ProjectSlugCheckResponse } from '#layers/thei/shared/api/project';

export default defineEventHandler(
  async (event): Promise<ProjectSlugCheckResponse> => {
    const query = getQuery(event);
    const slug = query.slug;

    if (typeof slug !== 'string' || !slug.trim()) {
      throw createError({ statusCode: 400, message: 'Slug is required' });
    }

    const excludeProjectUuid =
      typeof query.excludeProjectUuid === 'string'
        ? query.excludeProjectUuid
        : undefined;

    const project = await THEI_SERVER.projects.findBySlug(
      slug,
      excludeProjectUuid,
    );

    return { taken: Boolean(project) };
  },
);
