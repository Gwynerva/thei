import type { LifeWindowResponse } from '#layers/thei/shared/life';
import { getLifeWindow } from '../../thei/public/life';
import { resolveLifeQuery } from '../../thei/public/life-request';

export default defineEventHandler(
  async (event): Promise<LifeWindowResponse> => {
    const query = getQuery(event);
    const direction =
      query.direction === 'newer' || query.direction === 'older'
        ? query.direction
        : 'around';
    return getLifeWindow({
      ...(await resolveLifeQuery(event)),
      date: typeof query.d === 'string' ? query.d : undefined,
      cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
      direction,
    });
  },
);
