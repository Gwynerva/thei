import { getLifeRewind } from '../../thei/public/life';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  return getLifeRewind({
    isAdmin: await THEI_SERVER.isAdmin(event),
    page: query.page,
    pageSize: query.preview === 'true' ? 3 : 24,
  });
});
