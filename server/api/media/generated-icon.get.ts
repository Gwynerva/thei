import type { GeneratedIconKind } from '../../thei/media/generated-icon';
import { resolveGeneratedIcon } from '../../thei/media/generated-icon';

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const kind = query.kind;
  const seed = query.seed;
  if ((kind !== 'project' && kind !== 'author') || typeof seed !== 'string') {
    throw createError({ statusCode: 400, message: 'Invalid icon seed' });
  }
  return resolveGeneratedIcon(kind as GeneratedIconKind, seed);
});
