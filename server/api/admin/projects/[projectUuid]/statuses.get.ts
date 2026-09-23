import { getStatusHistory } from '../../../../thei/statuses';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'projectUuid') ?? '';
  const project = await THEI_SERVER.projects.findByUuid(identifier);
  if (!project) throw createError({ statusCode: 404 });
  const cursor = getQuery(event).cursor;
  return getStatusHistory(
    { type: 'project', id: project.projectUuid },
    typeof cursor === 'string' ? cursor : undefined,
    true,
  );
});
