import { isLifeDay, type LifeDay } from '#layers/thei/shared/life';
import { getLifeDay } from '../../thei/public/life';
import { resolveLifeQuery } from '../../thei/public/life-request';

export default defineEventHandler(async (event): Promise<LifeDay> => {
  const date = String(getQuery(event).date ?? '');
  if (!isLifeDay(date))
    throw createError({ statusCode: 400, statusText: 'Invalid date' });
  return getLifeDay(date, await resolveLifeQuery(event));
});
