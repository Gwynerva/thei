import type { LifeLatestResponse } from '#layers/thei/shared/life';
import { getLatestLifePoints } from '../../thei/public/life';

export default defineEventHandler(async (event): Promise<LifeLatestResponse> => {
  const requested = Number(getQuery(event).limit);
  const limit = Number.isInteger(requested) ? Math.min(20, Math.max(1, requested)) : 5;
  return {
    points: await getLatestLifePoints(limit, await THEI_SERVER.isAdmin(event)),
  };
});
