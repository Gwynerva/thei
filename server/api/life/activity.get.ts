import type { LifeActivityResponse } from '#layers/thei/shared/life';
import { getLifeActivity } from '../../thei/public/life';

export default defineEventHandler(
  async (event): Promise<LifeActivityResponse> => {
    const requested = Number(getQuery(event).year);
    return getLifeActivity({
      year:
        Number.isInteger(requested) && requested > 1900 && requested < 2200
          ? requested
          : undefined,
      isAdmin: await THEI_SERVER.isAdmin(event),
    });
  },
);
