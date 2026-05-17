import type { PublicAdminSession } from '#layers/thei/server/thei/admin-session/repository/publicSessions';

export default defineEventHandler(
  async (event): Promise<PublicAdminSession[]> => {
    return await THEI_SERVER.adminSessions.getPublic(event);
  },
);
