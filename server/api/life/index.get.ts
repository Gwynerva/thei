import type { LifeWindowResponse } from '#layers/thei/shared/life';
import { getLifeWindow } from '../../thei/public/life';

export default defineEventHandler(async (event): Promise<LifeWindowResponse> => {
  const query = getQuery(event);
  const direction =
    query.direction === 'newer' || query.direction === 'older'
      ? query.direction
      : 'around';
  return getLifeWindow({
    period: typeof query.period === 'string' ? query.period : undefined,
    cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
    direction,
    isAdmin: await THEI_SERVER.isAdmin(event),
  });
});
