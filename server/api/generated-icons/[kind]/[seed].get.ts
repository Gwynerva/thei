import {
  isGeneratedIconKind,
  resolveGeneratedIcon,
} from '../../../thei/media/generated-icon';

export default defineEventHandler((event) => {
  const kind = getRouterParam(event, 'kind');
  const seed = getRouterParam(event, 'seed');
  if (!isGeneratedIconKind(kind) || typeof seed !== 'string') {
    throw createError({ statusCode: 400, message: 'Invalid icon seed' });
  }
  return resolveGeneratedIcon(kind, seed);
});
