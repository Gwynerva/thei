import type { LifeActivityResponse } from '#layers/thei/shared/life';
import { getLifeActivity } from '../../thei/public/life';
import { resolveLifeQuery } from '../../thei/public/life-request';

export default defineEventHandler(
  async (event): Promise<LifeActivityResponse> => {
    const requested = Number(getQuery(event).year);
    return getLifeActivity({
      ...(await resolveLifeQuery(event)),
      year:
        Number.isInteger(requested) && requested > 1900 && requested < 2200
          ? requested
          : undefined,
    });
  },
);
