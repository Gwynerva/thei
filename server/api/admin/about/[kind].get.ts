import { getProfileHistory } from '../../../thei/profile';
export default defineEventHandler((event) => {
  const kind = getRouterParam(event, 'kind');
  if (kind !== 'avatars' && kind !== 'statuses')
    throw createError({ statusCode: 404 });
  const cursor = getQuery(event).cursor;
  return getProfileHistory(
    kind,
    typeof cursor === 'string' ? cursor : undefined,
    true,
  );
});
